import { Client, ConnectConfig, SFTPWrapper, ClientChannel } from 'ssh2'
import { SSHConnectionConfig, TerminalSize, FileInfo } from '../../shared/types.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'

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
        const sessionId = `session_${randomUUID()}`

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

    if (session.shell) {
      return session.shell
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

          stream.on('error', (err: Error) => {
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
      const decoder = new StringDecoder('utf8')
      session.shell.on('data', (data: Buffer) => {
        const decoded = decoder.write(data)
        if (decoded) callback(decoded)
      })
      session.shell.once('close', () => {
        const remaining = decoder.end()
        if (remaining) callback(remaining)
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
    // ~otheruser paths are not supported, return as-is
    if (remotePath !== '~' && !remotePath.startsWith('~/')) {
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
          let timer: ReturnType<typeof setTimeout> | null = null
          const done = (result: string) => {
            if (timer) { clearTimeout(timer); timer = null }
            resolve(result)
          }
          stream.on('data', (data: Buffer) => { output += data.toString('utf-8') })
          stream.on('close', () => { done(output.trim() || '/root') })
          stream.on('error', () => { done('/root') })
          // Fallback timeout in case the stream never closes
          timer = setTimeout(() => { done(output.trim() || '/root') }, 5000)
        })
      })
    }

    const home = session.home!
    if (remotePath === '~') return home
    return path.posix.join(home, remotePath.slice(2))
  }

  resolveRemotePath(sessionId: string, remotePath: string): Promise<string> {
    return this.resolvePath(sessionId, remotePath)
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

  private transfers = new Map<string, { cancel: () => void }>()

  async uploadFile(sessionId: string, localPath: string, remotePath: string, transferId: string, onProgress?: (percent: number, bytesPerSec: number) => void): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    const resolvedRemotePath = await this.resolvePath(sessionId, remotePath)

    return new Promise((resolve, reject) => {
      let stat: fs.Stats
      try {
        stat = fs.statSync(localPath)
      } catch (err) {
        reject(new Error(`Read local file failed: ${err}`))
        return
      }
      if (!stat.isFile()) {
        reject(new Error('Local path is not a file'))
        return
      }

      const totalSize = stat.size
      let transferred = 0
      let lastTime = Date.now()
      let lastBytes = 0
      let aborted = false
      let settled = false
      const readStream = fs.createReadStream(localPath)
      const writeStream = session.sftp.createWriteStream(resolvedRemotePath)

      const cleanup = () => {
        this.transfers.delete(transferId)
      }

      const fail = (error: Error) => {
        if (settled) return
        settled = true
        cleanup()
        readStream.destroy()
        writeStream.destroy()
        session.sftp.unlink(resolvedRemotePath, () => {})
        reject(error)
      }

      const cancel = () => {
        if (settled) return
        aborted = true
        fail(new Error('Cancelled'))
      }

      this.transfers.set(transferId, { cancel })

      readStream.on('data', (chunk: string | Buffer) => {
        if (aborted) return
        transferred += Buffer.byteLength(chunk)
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
        if (settled || aborted) return
        settled = true
        cleanup()
        if (onProgress && totalSize > 0) onProgress(100, 0)
        resolve()
      })

      writeStream.on('error', (err: Error) => {
        if (!aborted) fail(new Error(`Upload failed: ${err.message}`))
      })

      readStream.on('error', (err) => {
        if (!aborted) fail(new Error(`Read local file failed: ${err.message}`))
      })

      readStream.pipe(writeStream)
    })
  }

  async downloadFile(sessionId: string, remotePath: string, localPath: string, transferId: string, onProgress?: (percent: number, bytesPerSec: number) => void): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    const resolvedRemotePath = await this.resolvePath(sessionId, remotePath)

    // Stat the file first so totalSize is known before any data arrives,
    // avoiding the race where small files finish before fstat() returns.
    const totalSize = await new Promise<number>((resolve) => {
      session.sftp.stat(resolvedRemotePath, (err, stats) => {
        resolve(!err && stats ? stats.size : 0)
      })
    })

    return new Promise((resolve, reject) => {
      const readStream = session.sftp.createReadStream(resolvedRemotePath)
      const writeStream = fs.createWriteStream(localPath)

      let transferred = 0
      let lastTime = Date.now()
      let lastBytes = 0
      let aborted = false
      let settled = false

      const cleanup = () => {
        this.transfers.delete(transferId)
      }

      const fail = (error: Error) => {
        if (settled) return
        settled = true
        cleanup()
        readStream.destroy()
        writeStream.destroy()
        fs.rm(localPath, { force: true }, () => {})
        reject(error)
      }

      const cancel = () => {
        if (settled) return
        aborted = true
        fail(new Error('Cancelled'))
      }

      this.transfers.set(transferId, { cancel })

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
        if (settled || aborted) return
        settled = true
        cleanup()
        if (onProgress && totalSize > 0) onProgress(100, 0)
        resolve()
      })

      writeStream.on('error', (err) => {
        if (!aborted) fail(new Error(`Write local file failed: ${err.message}`))
      })

      readStream.on('error', (err: Error) => {
        if (!aborted) fail(new Error(`Download failed: ${err.message}`))
      })

      readStream.pipe(writeStream)
    })
  }

  cancelTransfer(transferId: string): void {
    const transfer = this.transfers.get(transferId)
    if (transfer) {
      transfer.cancel()
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

  async copyFile(sessionId: string, srcPath: string, destPath: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    const resolvedSrc = await this.resolvePath(sessionId, srcPath)
    const resolvedDest = await this.resolvePath(sessionId, destPath)

    const stat = (p: string) => new Promise<import('ssh2').Stats>((resolve, reject) => {
      session.sftp.lstat(p, (err, s) => (err ? reject(new Error(`lstat failed: ${err}`)) : resolve(s)))
    })
    const readdir = (p: string) => new Promise<import('ssh2').FileEntry[]>((resolve, reject) => {
      session.sftp.readdir(p, (err, list) => (err ? reject(new Error(`readdir failed: ${err}`)) : resolve(list)))
    })
    const mkdir = (p: string) => new Promise<void>((resolve, reject) => {
      session.sftp.mkdir(p, (err) => (err ? reject(new Error(`mkdir failed: ${err}`)) : resolve()))
    })
    const copyOne = (from: string, to: string): Promise<void> => new Promise((resolve, reject) => {
      const readStream = session.sftp.createReadStream(from)
      const writeStream = session.sftp.createWriteStream(to)
      let settled = false
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        readStream.destroy()
        writeStream.destroy()
        session.sftp.unlink(to, () => {})
        reject(error)
      }
      writeStream.on('close', () => {
        if (!settled) {
          settled = true
          resolve()
        }
      })
      writeStream.on('error', (err: Error) => fail(new Error(`Copy write failed: ${err.message}`)))
      readStream.on('error', (err: Error) => fail(new Error(`Copy read failed: ${err.message}`)))
      readStream.pipe(writeStream)
    })
    const copyTree = async (from: string, to: string) => {
      const stats = await stat(from)
      if (stats.isDirectory()) {
        await mkdir(to)
        const list = await readdir(from)
        for (const entry of list) {
          await copyTree(`${from}/${entry.filename}`, `${to}/${entry.filename}`)
        }
      } else {
        await copyOne(from, to)
      }
    }

    await copyTree(resolvedSrc, resolvedDest)
  }

  async downloadDirectory(sessionId: string, remotePath: string, localPath: string, transferId: string, onProgress?: (percent: number, bytesPerSec: number) => void): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    const resolvedRemotePath = await this.resolvePath(sessionId, remotePath)
    const parentDir = path.posix.dirname(resolvedRemotePath)
    const baseName = path.posix.basename(resolvedRemotePath)
    const quote = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`
    const command = `tar czf - -C ${quote(parentDir)} ${quote(baseName)}`

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(localPath)
      let transferred = 0
      let lastTime = Date.now()
      let lastBytes = 0
      let aborted = false
      let settled = false
      let channel: ClientChannel | null = null

      const cleanup = () => {
        this.transfers.delete(transferId)
      }

      const fail = (error: Error) => {
        if (settled) return
        settled = true
        cleanup()
        channel?.close()
        writeStream.destroy()
        fs.rm(localPath, { force: true }, () => {})
        reject(error)
      }

      const cancel = () => {
        if (settled) return
        aborted = true
        fail(new Error('Cancelled'))
      }

      this.transfers.set(transferId, { cancel })

      session.client.exec(command, (err, stream) => {
        if (err) {
          fail(new Error(`Failed to start tar: ${err}`))
          return
        }
        channel = stream

        let stderr = ''
        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })

        stream.on('data', (chunk: Buffer) => {
          if (aborted) return
          transferred += chunk.length
          const now = Date.now()
          const dt = (now - lastTime) / 1000
          if (dt >= 0.3) {
            const bytesPerSec = (transferred - lastBytes) / dt
            lastTime = now
            lastBytes = transferred
            if (onProgress) onProgress(-1, bytesPerSec / 1024)
          }
        })

        writeStream.on('error', (writeErr) => {
          if (!aborted) fail(new Error(`Write local file failed: ${writeErr.message}`))
        })

        stream.on('error', (streamErr: Error) => fail(new Error(`tar stream failed: ${streamErr.message}`)))

        stream.on('close', () => {
          if (settled || aborted) return
          if (stderr.trim() && transferred === 0) {
            fail(new Error(stderr.trim() || 'tar failed'))
            return
          }
          settled = true
          cleanup()
          if (onProgress) onProgress(100, 0)
          resolve()
        })
      })
    })
  }

  async getSystemStats(sessionId: string): Promise<{ cpu: number; mem: { used: number; total: number }; net: { rx: number; tx: number } }> {    const session = this.sessions.get(sessionId)
    if (!session || !session.connected) {
      throw new Error('Session not connected')
    }

    const script = `
      export LC_ALL=C
      if [ "$(uname -s 2>/dev/null)" != "Linux" ]; then
        printf "UNSUPPORTED\\n"
        exit 0
      fi
      cpu_idle=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)%* id.*/\\1/" | awk '{print $1}')
      cpu_usage=$(awk "BEGIN {print 100 - $cpu_idle}")
      mem_info=$(free -m | awk '/Mem:/ {print $3","$2}')
      net_info=$(awk -F: '/:/ && !/lo:/ {split($2, a, " "); rx += a[1]; tx += a[9]} END {print rx+0","tx+0}' /proc/net/dev)
      printf "%.1f|%s|%s\\n" "$cpu_usage" "$mem_info" "$net_info"
    `

    return new Promise((resolve, reject) => {
      let settled = false
      let channel: ClientChannel | null = null
      const finish = (error?: Error, value?: { cpu: number; mem: { used: number; total: number }; net: { rx: number; tx: number } }) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) reject(error)
        else if (value) resolve(value)
      }
      const timer = setTimeout(() => {
        channel?.close()
        finish(new Error('System monitoring timed out'))
      }, 5000)

      session.client.exec(script, (err, stream) => {
        if (err) {
          finish(err)
          return
        }
        channel = stream
        let output = ''
        let stderr = ''
        stream.on('data', (data: Buffer) => { output += data.toString() })
        stream.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
        stream.on('error', (streamError: Error) => finish(streamError))
        stream.on('close', () => {
          try {
            const trimmed = output.trim()
            if (trimmed === 'UNSUPPORTED') {
              finish(new Error('System monitoring is only available on Linux'))
              return
            }
            const parts = trimmed.split('|')
            if (parts.length < 3) throw new Error(stderr.trim() || 'Invalid output format')

            const cpu = parseFloat(parts[0])
            const [memUsed, memTotal] = parts[1].split(',').map(Number)
            const [rx, tx] = parts[2].split(',').map(Number)

            if (![cpu, memUsed, memTotal, rx, tx].every(Number.isFinite) || memTotal <= 0) {
              throw new Error('Invalid system monitoring values')
            }
            finish(undefined, {
              cpu: Math.max(0, Math.min(100, cpu)),
              mem: { used: memUsed, total: memTotal },
              net: { rx, tx }
            })
          } catch (parseError) {
            finish(new Error(`Failed to read system stats: ${parseError instanceof Error ? parseError.message : output}`))
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
    const modeStr = (mode & parseInt('777', 8)).toString(8).padStart(3, '0')
    let result = ''
    for (let i = 0; i < 3; i++) {
      result += perms[parseInt(modeStr[i])]
    }
    return result
  }

  private rmdirRecursive(session: SSHSession, remotePath: string, callback: (err: Error | null) => void): void {
    let called = false
    const done = (err?: Error | null) => {
      if (called) return
      called = true
      callback(err ?? null)
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
