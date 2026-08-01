import { ipcMain, dialog, BrowserWindow } from 'electron'
import { SSHService } from './ssh/ssh-service.js'
import { ConnectionStore } from './store/connection-store.js'
import { SSHConnectionConfig, Session, TerminalSize } from '../shared/types.js'

export class IPCManager {
  private sshService: SSHService
  private connectionStore: ConnectionStore
  private sessions: Map<string, Session> = new Map()
  private window: BrowserWindow
  private shellCallbacksAttached = new Set<string>()

  constructor(window: BrowserWindow) {
    this.sshService = new SSHService()
    this.connectionStore = new ConnectionStore()
    this.window = window
    this.registerHandlers()
  }

  private registerHandlers(): void {
    ipcMain.handle('connections:list', () => {
      return this.connectionStore.list()
    })

    ipcMain.handle('connections:save', (_event, config: SSHConnectionConfig) => {
      return this.connectionStore.save_connection(config)
    })

    ipcMain.handle('connections:delete', (_event, id: string) => {
      return this.connectionStore.delete(id)
    })

    ipcMain.handle('connections:get', (_event, id: string) => {
      return this.connectionStore.get(id) || null
    })

    ipcMain.handle('connections:test', async (_event, config: Omit<SSHConnectionConfig, 'id' | 'name' | 'createdAt' | 'updatedAt'>) => {
      const startTime = Date.now()
      try {
        const tempConfig: SSHConnectionConfig = {
          ...config,
          id: 'test',
          name: 'test',
          createdAt: '',
          updatedAt: '',
        }
        const session = await this.sshService.connect(tempConfig)
        const latency = Date.now() - startTime
        this.sshService.disconnect(session.id)
        return { success: true, message: 'Connection successful', latency }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : 'Unknown error' }
      }
    })

    ipcMain.handle('sessions:open', (_event, configId: string) => {
      return this.openSession(configId)
    })

    ipcMain.handle('sessions:open-shell', (_event, sessionId: string, size: TerminalSize) => {
      return this.setupShellCallbacks(sessionId, size)
    })

    ipcMain.handle('sessions:list', () => {
      return Array.from(this.sessions.values())
    })

    ipcMain.handle('sessions:close', (_event, sessionId: string) => {
      this.sshService.disconnect(sessionId)
      this.sessions.delete(sessionId)
      this.shellCallbacksAttached.delete(sessionId)
    })

    ipcMain.on('sessions:send-input', (_event, sessionId: string, data: string) => {
      this.sshService.writeToShell(sessionId, data)
    })

    ipcMain.on('sessions:resize', (_event, sessionId: string, size: TerminalSize) => {
      this.sshService.resizeTerminal(sessionId, size)
    })

    ipcMain.handle('sessions:execute', async (_event, sessionId: string, command: string) => {
      const session = this.sshService.getSession(sessionId)
      if (!session || !session.connected) {
        throw new Error('Session not connected')
      }

      return new Promise<string>((resolve, reject) => {
        session.client.exec(command, (err, stream) => {
          if (err) {
            reject(new Error(`Execute failed: ${err}`))
            return
          }

          let output = ''
          stream.on('data', (data: Buffer) => {
            output += data.toString('utf-8')
          })
          stream.stderr.on('data', (data: Buffer) => {
            output += data.toString('utf-8')
          })
          stream.on('error', (streamErr: Error) => {
            reject(new Error(`Stream error: ${streamErr}`))
          })
          stream.on('close', () => {
            resolve(output)
          })
        })
      })
    })

    ipcMain.handle('sessions:stats', async (_event, sessionId: string) => {
      return this.sshService.getSystemStats(sessionId)
    })

    ipcMain.handle('files:list', async (_event, sessionId: string, remotePath: string) => {
      return this.sshService.listFiles(sessionId, remotePath)
    })

    ipcMain.handle('files:upload', async (_event, sessionId: string, localPath: string, remotePath: string, transferId: string) => {
      await this.sshService.uploadFile(sessionId, localPath, remotePath, transferId, (percent, speed) => {
        if (!this.window.isDestroyed()) {
          this.window.webContents.send('files:progress', { sessionId, id: transferId, percent, speed })
        }
      })
    })

    ipcMain.handle('files:download', async (_event, sessionId: string, remotePath: string, localPath: string, transferId: string) => {
      await this.sshService.downloadFile(sessionId, remotePath, localPath, transferId, (percent, speed) => {
        if (!this.window.isDestroyed()) {
          this.window.webContents.send('files:progress', { sessionId, id: transferId, percent, speed })
        }
      })
    })

    ipcMain.handle('files:cancel', (_event, transferId: string) => {
      this.sshService.cancelTransfer(transferId)
    })

    ipcMain.handle('files:delete', async (_event, sessionId: string, remotePath: string) => {
      await this.sshService.deleteFile(sessionId, remotePath)
    })

    ipcMain.handle('files:mkdir', async (_event, sessionId: string, remotePath: string) => {
      await this.sshService.mkdir(sessionId, remotePath)
    })

    ipcMain.handle('files:read', async (_event, sessionId: string, remotePath: string) => {
      return this.sshService.readFile(sessionId, remotePath)
    })

    ipcMain.handle('files:write', async (_event, sessionId: string, remotePath: string, content: string) => {
      await this.sshService.writeFile(sessionId, remotePath, content)
    })

    ipcMain.handle('files:rename', async (_event, sessionId: string, oldPath: string, newPath: string) => {
      await this.sshService.rename(sessionId, oldPath, newPath)
    })

    ipcMain.handle('files:copy', async (_event, sessionId: string, srcPath: string, destPath: string) => {
      await this.sshService.copyFile(sessionId, srcPath, destPath)
    })

    ipcMain.handle('files:download-dir', async (_event, sessionId: string, remotePath: string, localPath: string, transferId: string) => {
      await this.sshService.downloadDirectory(sessionId, remotePath, localPath, transferId, (percent, speed) => {
        if (!this.window.isDestroyed()) {
          this.window.webContents.send('files:progress', { sessionId, id: transferId, percent, speed })
        }
      })
    })

    ipcMain.handle('files:stat', async (_event, sessionId: string, remotePath: string) => {
      return this.sshService.stat(sessionId, remotePath)
    })

    ipcMain.handle('files:resolve', async (_event, sessionId: string, remotePath: string) => {
      return this.sshService.resolveRemotePath(sessionId, remotePath)
    })

    ipcMain.handle('app:pick-file', async (_event, options?: Electron.OpenDialogOptions) => {
      const result = await dialog.showOpenDialog(this.window, {
        properties: ['openFile'],
        ...options,
      })

      if (result.canceled) {
        return null
      }

      return result.filePaths[0] || null
    })

    ipcMain.handle('app:save-file', async (_event, options?: Electron.SaveDialogOptions) => {
      const result = await dialog.showSaveDialog(this.window, options ?? {})

      if (result.canceled) {
        return null
      }

      return result.filePath || null
    })
  }

  async openSession(configId: string): Promise<Session> {
    const config = this.connectionStore.get(configId)
    if (!config) {
      throw new Error('Connection not found')
    }

    const sshSession = await this.sshService.connect(config)
    const session: Session = {
      id: sshSession.id,
      configId: config.id,
      configName: config.name,
      connected: true,
      createdAt: new Date().toISOString(),
    }

    this.sessions.set(session.id, session)
    return session
  }

  async setupShellCallbacks(sessionId: string, size?: TerminalSize): Promise<void> {
    await this.sshService.openShell(sessionId, size)
    if (this.shellCallbacksAttached.has(sessionId)) return

    this.shellCallbacksAttached.add(sessionId)
    this.sshService.onShellData(sessionId, (data) => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send('shell:data', sessionId, data)
      }
    })

    this.sshService.onShellClose(sessionId, () => {
      this.shellCallbacksAttached.delete(sessionId)
      if (!this.window.isDestroyed()) {
        this.window.webContents.send('shell:close', sessionId)
      }
      const appSession = this.sessions.get(sessionId)
      if (appSession) {
        appSession.connected = false
      }
    })
  }

  disconnectAll(): void {
    this.sshService.disconnectAll()
    this.sessions.clear()
    this.shellCallbacksAttached.clear()
  }

  dispose(): void {
    this.disconnectAll()
    const handleChannels = [
      'connections:list', 'connections:save', 'connections:delete', 'connections:get', 'connections:test',
      'sessions:open', 'sessions:open-shell', 'sessions:list', 'sessions:close', 'sessions:execute', 'sessions:stats',
      'files:list', 'files:upload', 'files:download', 'files:cancel', 'files:delete', 'files:mkdir',
      'files:read', 'files:write', 'files:rename', 'files:stat', 'files:resolve', 'app:pick-file', 'app:save-file',
    ]
    for (const channel of handleChannels) ipcMain.removeHandler(channel)
    ipcMain.removeAllListeners('sessions:send-input')
    ipcMain.removeAllListeners('sessions:resize')
  }
}
