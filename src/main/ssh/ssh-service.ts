import { Client, ConnectConfig, SFTPWrapper, ClientChannel } from 'ssh2'
import { SSHConnectionConfig, TerminalSize, FileInfo } from '../../shared/types.js'
import * as fs from 'node:fs'
import * as path from 'node:path'

export interface SSHSession {
  id: string
  client: Client
  sftp: SFTPWrapper
  shell: ClientChannel | null
  connected: boolean
  configId: string
  home?: string
}

export class SSHService {
  private sessions: Map<string, SSHSession> = new Map()

  async connect(config: SSHConnectionConfig): Promise<SSHSession> {
    const client = new Client()

    return new Promise((resolve, reject) => {
      const connectConfig: ConnectConfig = {
        host: config.host,
        port: config.port,
        username: config.username,
        readyTimeout: 10000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
      }

      if (config.authType === 'password') {
        connectConfig.password = config.password
      } else {
        try {
          const privateKey = fs.readFileSync(config.privateKeyPath!, 'utf-8')
          connectConfig.privateKey = privateKey
          if (config.passphrase) {
            connectConfig.passphrase = config.passphrase
          }
        } catch (err) {
          reject(new Error(`Failed to read private key: ${err}`))
          return
        }
      }

      client.on('ready', () => {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

        client.sftp((err, sftp) => {
          if (err) {
            client.end()
            reject(new Error(`SFTP connection failed: ${err}`))
            return
          }

          const session: SSHSession = {
            id: sessionId,
            client,
            sftp,
            shell: null,
            connected: true,
            configId: config.id,
          }

          this.sessions.set(sessionId, session)
          resolve(session)
        })
      })

      client.on('error', (err) => {
        reject(new Error(`SSH connection failed: ${err.message}`))
      })

      client.on('close', () => {
        const session = Array.from(this.sessions.values()).find(s => s.client === client)
        if (session) {
          session.connected = false
          this.sessions.delete(session.id)
        }
      })

      client.on('end', () => {
        const session = Array.from(this.sessions.values()).find(s => s.client === client)
        if (session) {
          session.connected = false
        }
      })

      client.connect(connectConfig)
    })
  }

  async openShell(sessionId: string, size: TerminalSize = { cols: 80, rows: 24 }): Promise<ClientChannel> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    return new Promise((resolve, reject) => {
      session.client.shell(
        {
          term: 'xterm-256color',
          cols: size.cols,
          rows: size.rows,
        },
        (err, stream) => {
          if (err) {
            reject(new Error(`Failed to open shell: ${err}`))
            return
          }

          session.shell = stream

          stream.on('close', () => {
            session.shell = null
            session.connected = false
          })

          stream.on('error', (err) => {
            reject(new Error(`Shell error: ${err}`))
          })

          resolve(stream)
        }
      )
    })
  }

  resizeTerminal(sessionId: string, size: TerminalSize): void {
    const session = this.sessions.get(sessionId)
    if (session?.shell) {
      session.shell.setWindow(size.rows, size.cols, 0, 0)
    }
  }

  writeToShell(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (session?.shell) {
      session.shell.write(data)
    }
  }

  onShellData(sessionId: string, callback: (data: string) => void): void {
    const session = this.sessions.get(sessionId)
    if (session?.shell) {
      session.shell.on('data', (data: Buffer) => {
        callback(data.toString('utf-8'))
      })
    }
  }

  onShellClose(sessionId: string, callback: () => void): void {
    const session = this.sessions.get(sessionId)
    if (session?.shell) {
      session.shell.on('close', () => {
        callback()
      })
    }
  }

  private async resolvePath(sessionId: string, remotePath: string): Promise<string> {
    if (!remotePath.startsWith('~')) {
      return remotePath
    }
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      return remotePath
    }

    if (!session.home) {
      session.home = await new Promise<string>((resolve) => {
        session.client.exec('echo $HOME', (err, stream) => {
          if (err) {
            resolve('/root')
            return
          }
          let output = ''
          stream.on('data', (data: Buffer) => { output += data.toString('utf-8') })
          stream.on('close', () => { resolve(output.trim() || '/root') })
          stream.on('error', () => { resolve('/root') })
          // Set timeout to prevent hanging
          setTimeout(() => resolve(output.trim() || '/root'), 5000)
        })
      })
    }

    const home = session.home!
    if (remotePath === '~') return home
    if (remotePath.startsWith('~/')) return path.posix.join(home, remotePath.slice(2))
    return remotePath.replace('~', home)
  }

  async listFiles(sessionId: string, remotePath: string): Promise<import('../../shared/types').FileInfo[]> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    let resolvedPath: string
    try {
      resolvedPath = await this.resolvePath(sessionId, remotePath)
    } catch (err) {
      throw new Error(`Failed to resolve path: ${err}`)
    }

    return new Promise((resolve, reject) => {
      session.sftp.readdir(resolvedPath, (err, list) => {
        if (err) {
          const errorMsg = String(err)
          if (errorMsg.includes('No such file')) {
            reject(new Error(`Directory not found: ${resolvedPath}`))
          } else {
            reject(new Error(`Failed to list directory: ${err}`))
          }
          return
        }

        const files = list
          .filter((item) => item.filename !== '.' && item.filename !== '..')
          .map((item) => ({
            name: item.filename,
            path: path.posix.join(resolvedPath, item.filename),
            isDirectory: item.attrs.isDirectory(),
            size: item.attrs.size,
            permissions: this.formatPermissions(item.attrs.mode),
            owner: String(item.attrs.uid),
            group: String(item.attrs.gid),
            modifiedAt: new Date(item.attrs.mtime * 1000).toISOString(),
          }))

        files.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })

        resolve(files)
      })
    })
  }

  private transfers: Map<string, { readStream: NodeJS.ReadableStream; writeStream: NodeJS.WritableStream }> = new Map()

  async uploadFile(sessionId: string, localPath: string, remotePath: string, transferId: string, onProgress?: (percent: number, bytesPerSec: number) => void): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    const resolvedRemotePath = await this.resolvePath(sessionId, remotePath)

    return new Promise((resolve, reject) => {
      const stat = fs.statSync(localPath)
      if (!stat.isFile()) {
        reject(new Error('Local path is not a file'))
        return
      }

      const totalSize = stat.size
      let transferred = 0
      let lastTime = Date.now()
      let lastBytes = 0
      let aborted = false
      const readStream = fs.createReadStream(localPath)
      const writeStream = session.sftp.createWriteStream(resolvedRemotePath)

      this.transfers.set(transferId, { readStream, writeStream })

      const cleanup = () => {
        this.transfers.delete(transferId)
      }

      readStream.on('data', (chunk: Buffer) => {
        if (aborted) return
        transferred += chunk.length
        const now = Date.now()
        const dt = (now - lastTime) / 1000
        if (dt >= 0.3) {
          const bytesPerSec = (transferred - lastBytes) / dt
          lastTime = now
          lastBytes = transferred
          if (onProgress && totalSize > 0) {
            onProgress(Math.round((transferred / totalSize) * 100), bytesPerSec / 1024)
          }
        }
      })

      writeStream.on('close', () => {
        cleanup()
        if (aborted) {
          reject(new Error('Cancelled'))
        } else {
          resolve(transferId)
        }
      })

      writeStream.on('error', (err) => {
        cleanup()
        if (!aborted) reject(new Error(`Upload failed: ${err}`))
      })

      readStream.on('error', (err) => {
        cleanup()
        if (!aborted) reject(new Error(`Read local file failed: ${err}`))
      })

      ;(writeStream as any)._cancel = () => {
        aborted = true
        readStream.destroy()
        writeStream.destroy()
        cleanup()
      }

      readStream.pipe(writeStream)
    })
  }

  async downloadFile(sessionId: string, remotePath: string, localPath: string, transferId: string, onProgress?: (percent: number, bytesPerSec: number) => void): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    const resolvedRemotePath = await this.resolvePath(sessionId, remotePath)

    return new Promise((resolve, reject) => {
      const readStream = session.sftp.createReadStream(resolvedRemotePath)
      const writeStream = fs.createWriteStream(localPath)

      let totalSize = 0
      let transferred = 0
      let lastTime = Date.now()
      let lastBytes = 0
      let aborted = false

      this.transfers.set(transferId, { readStream, writeStream })

      const cleanup = () => {
        this.transfers.delete(transferId)
      }

      readStream.on('data', (chunk: Buffer) => {
        if (aborted) return
        transferred += chunk.length
        const now = Date.now()
        const dt = (now - lastTime) / 1000
        if (dt >= 0.3) {
          const bytesPerSec = (transferred - lastBytes) / dt
          lastTime = now
          lastBytes = transferred
          if (onProgress && totalSize > 0) {
            onProgress(Math.round((transferred / totalSize) * 100), bytesPerSec / 1024)
          }
        }
      })

      readStream.on('open', (fd: number) => {
        session.sftp.fstat(fd, (err, stats) => {
          if (!err && stats) {
            totalSize = stats.size
          }
        })
      })

      writeStream.on('close', () => {
        cleanup()
        if (aborted) {
          reject(new Error('Cancelled'))
        } else {
          resolve(transferId)
        }
      })

      writeStream.on('error', (err) => {
        cleanup()
        if (!aborted) reject(new Error(`Write local file failed: ${err}`))
      })

      readStream.on('error', (err) => {
        cleanup()
        if (!aborted) reject(new Error(`Download failed: ${err}`))
      })

      ;(writeStream as any)._cancel = () => {
        aborted = true
        readStream.destroy()
        writeStream.destroy()
        cleanup()
      }

      readStream.pipe(writeStream)
    })
  }

  cancelTransfer(transferId: string): void {
    const transfer = this.transfers.get(transferId)
    if (transfer) {
      ;(transfer.writeStream as any)._cancel?.()
    }
  }

  async deleteFile(sessionId: string, remotePath: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    const resolvedPath = await this.resolvePath(sessionId, remotePath)

    // 安全检查：禁止删除根目录
    if (resolvedPath === '/') {
      throw new Error('Permission denied: cannot delete root directory')
    }

    return new Promise((resolve, reject) => {
      // 使用 lstat 而非 stat，防止删除软链接指向的内容
      session.sftp.lstat(resolvedPath, (err, stats) => {
        if (err) {
          reject(new Error(`File not found: ${err}`))
          return
        }

        if (stats.isDirectory()) {
          this.rmdirRecursive(session, resolvedPath, (err) => {
            if (err) {
              reject(new Error(`Delete directory failed: ${err}`))
            } else {
              resolve()
            }
          })
        } else {
          session.sftp.unlink(resolvedPath, (err) => {
            if (err) {
              reject(new Error(`Delete file failed: ${err}`))
            } else {
              resolve()
            }
          })
        }
      })
    })
  }

  async mkdir(sessionId: string, remotePath: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    const resolvedPath = await this.resolvePath(sessionId, remotePath)

    return new Promise((resolve, reject) => {
      session.sftp.mkdir(resolvedPath, (err) => {
        if (err) {
          reject(new Error(`Create directory failed: ${err}`))
        } else {
          resolve()
        }
      })
    })
  }

  async readFile(sessionId: string, remotePath: string): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    const resolvedPath = await this.resolvePath(sessionId, remotePath)

    return new Promise((resolve, reject) => {
      // Use lstat to check the actual node type (prevent following symlinks to directories)
      session.sftp.lstat(resolvedPath, (err, stats) => {
        if (err) {
          reject(new Error(`Failed to get file stats: ${err}`))
          return
        }

        if (stats.isDirectory()) {
          reject(new Error('Cannot open a directory as a file'))
          return
        }

        // Limit file size for editor (e.g., 5MB)
        const MAX_SIZE = 5 * 1024 * 1024
        if (stats.size > MAX_SIZE) {
          reject(new Error(`File is too large to edit (${(stats.size / 1024 / 1024).toFixed(2)}MB). Max size is 5MB.`))
          return
        }

        session.sftp.readFile(resolvedPath, (readErr, data) => {
          if (readErr) {
            reject(new Error(`Read file failed: ${readErr}`))
          } else {
            // Detect if file is binary by checking for null bytes in the first 8KB
            // For very small files, we check if they are printable
            const buffer = data.slice(0, 8192)
            let isBinary = false
            for (let i = 0; i < buffer.length; i++) {
              if (buffer[i] === 0) {
                isBinary = true
                break
              }
            }

            if (isBinary) {
              reject(new Error('不支持的文件格式：该文件似乎是二进制文件，无法编辑'))
            } else {
              resolve(data.toString('utf-8'))
            }
          }
        })
      })
    })
  }

  async writeFile(sessionId: string, remotePath: string, content: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    const resolvedPath = await this.resolvePath(sessionId, remotePath)

    return new Promise((resolve, reject) => {
      session.sftp.writeFile(resolvedPath, content, (err) => {
        if (err) {
          reject(new Error(`Write file failed: ${err}`))
        } else {
          resolve()
        }
      })
    })
  }

  async rename(sessionId: string, oldPath: string, newPath: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    const resolvedOldPath = await this.resolvePath(sessionId, oldPath)
    const resolvedNewPath = await this.resolvePath(sessionId, newPath)

    return new Promise((resolve, reject) => {
      session.sftp.rename(resolvedOldPath, resolvedNewPath, (err) => {
        if (err) {
          reject(new Error(`Rename failed: ${err}`))
        } else {
          resolve()
        }
      })
    })
  }

  async getSystemStats(sessionId: string): Promise<{ cpu: number; mem: { used: number; total: number }; net: { rx: number; tx: number } }> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    // 优化后的监控脚本：
    // CPU: 使用 top 获取当前空闲比例并反算
    // Mem: 使用 free -m
    // Net: 使用 /proc/net/dev 排除 lo，先处理冒号分隔符确保列索引准确
    const script = `
      cpu_idle=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)%* id.*/\\1/" | awk '{print $1}')
      cpu_usage=$(awk "BEGIN {print 100 - $cpu_idle}")
      
      mem_info=$(free -m | awk '/Mem:/ {print $3","$2}')
      
      net_info=$(awk -F: '/:/ && !/lo:/ {split($2, a, " "); rx += a[1]; tx += a[9]} END {print rx+0","tx+0}' /proc/net/dev)
      
      printf "%.1f|%s|%s\\n" "$cpu_usage" "$mem_info" "$net_info"
    `

    return new Promise((resolve, reject) => {
      session.client.exec(script, (err, stream) => {
        if (err) return reject(err)
        let output = ''
        stream.on('data', (data: Buffer) => { output += data.toString() })
        stream.on('close', () => {
          try {
            const parts = output.trim().split('|')
            if (parts.length < 3) return reject(new Error('Invalid output format'))
            
            const cpu = parseFloat(parts[0]) || 0
            const [memUsed, memTotal] = parts[1].split(',').map(Number)
            const [rx, tx] = parts[2].split(',').map(Number)
            
            resolve({
              cpu,
              mem: { used: memUsed, total: memTotal },
              net: { rx: rx || 0, tx: tx || 0 }
            })
          } catch (e) {
            reject(new Error('Failed to parse stats output: ' + output))
          }
        })
      })
    })
  }

  async stat(sessionId: string, remotePath: string): Promise<import('../../shared/types').FileInfo> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    const resolvedPath = await this.resolvePath(sessionId, remotePath)

    return new Promise((resolve, reject) => {
      session.sftp.stat(resolvedPath, (err, stats) => {
        if (err) {
          reject(new Error(`Stat failed: ${err}`))
          return
        }

        resolve({
          name: path.posix.basename(resolvedPath),
          path: resolvedPath,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          permissions: this.formatPermissions(stats.mode),
          owner: String(stats.uid),
          group: String(stats.gid),
          modifiedAt: new Date(stats.mtime * 1000).toISOString(),
        })
      })
    })
  }

  disconnect(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      if (session.shell) {
        session.shell.close()
      }
      session.client.end()
      this.sessions.delete(sessionId)
    }
  }

  disconnectAll(): void {
    for (const [sessionId] of this.sessions) {
      this.disconnect(sessionId)
    }
  }

  getSession(sessionId: string): SSHSession | undefined {
    return this.sessions.get(sessionId)
  }

  isConnected(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    return session?.connected === true
  }

  private formatPermissions(mode: number): string {
    const perms = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']
    const modeStr = (mode & parseInt('777', 8)).toString(8)
    let result = ''
    for (let i = 0; i < 3; i++) {
      result += perms[parseInt(modeStr[i])]
    }
    return result
  }

  private rmdirRecursive(session: SSHSession, remotePath: string, callback: (err: Error | null) => void): void {
    let called = false
    const done = (err: Error | null) => {
      if (called) return
      called = true
      callback(err)
    }

    session.sftp.readdir(remotePath, (err, rawList) => {
      if (err) return done(err)

      const list = rawList.filter((item) => item.filename !== '.' && item.filename !== '..')
      let pending = list.length
      if (pending === 0) return session.sftp.rmdir(remotePath, done)

      for (const item of list) {
        const itemPath = path.posix.join(remotePath, item.filename)
        // 使用 item.attrs.isDirectory() 判断，注意 readdir 的 attrs 通常是 lstat 结果
        // 如果是文件夹且不是软链接，则递归删除
        if (item.attrs.isDirectory() && !item.attrs.isSymbolicLink()) {
          this.rmdirRecursive(session, itemPath, (err) => {
            if (err) return done(err)
            if (--pending === 0) session.sftp.rmdir(remotePath, done)
          })
        } else {
          // 如果是文件或者是软链接（不管是文件链接还是目录链接），直接 unlink
          session.sftp.unlink(itemPath, (err) => {
            if (err) return done(err)
            if (--pending === 0) session.sftp.rmdir(remotePath, done)
          })
        }
      }
    })
  }
}
