import { contextBridge, ipcRenderer } from 'electron'
import { RShellApi, SSHConnectionConfig, Session, TerminalSize } from '../shared/types'

const api: RShellApi = {
  connections: {
    list: () => ipcRenderer.invoke('connections:list'),
    save: (config: SSHConnectionConfig) => ipcRenderer.invoke('connections:save', config),
    delete: (id: string) => ipcRenderer.invoke('connections:delete', id),
    get: (id: string) => ipcRenderer.invoke('connections:get', id),
    test: (config) => ipcRenderer.invoke('connections:test', config),
  },
  sessions: {
    open: (configId: string) => {
      ipcRenderer.send('sessions:connect-and-setup', configId)
      return Promise.resolve({} as Session)
    },
    openShell: (sessionId: string, size: TerminalSize) => ipcRenderer.invoke('sessions:open-shell', sessionId, size),
    close: (sessionId: string) => ipcRenderer.invoke('sessions:close', sessionId),
    list: () => ipcRenderer.invoke('sessions:list'),
    sendInput: (sessionId: string, data: string) => { ipcRenderer.send('sessions:send-input', sessionId, data) },
    resize: (sessionId: string, size: TerminalSize) => { ipcRenderer.send('sessions:resize', sessionId, size) },
    execute: (sessionId: string, command: string) => ipcRenderer.invoke('sessions:execute', sessionId, command),
    stats: (sessionId: string) => ipcRenderer.invoke('sessions:stats', sessionId),
  },
  files: {
    list: (sessionId: string, path: string) => ipcRenderer.invoke('files:list', sessionId, path),
    upload: (sessionId: string, localPath: string, remotePath: string, transferId: string) => ipcRenderer.invoke('files:upload', sessionId, localPath, remotePath, transferId),
    download: (sessionId: string, remotePath: string, localPath: string, transferId: string) => ipcRenderer.invoke('files:download', sessionId, remotePath, localPath, transferId),
    delete: (sessionId: string, path: string) => ipcRenderer.invoke('files:delete', sessionId, path),
    mkdir: (sessionId: string, path: string) => ipcRenderer.invoke('files:mkdir', sessionId, path),
    rename: (sessionId: string, oldPath: string, newPath: string) => ipcRenderer.invoke('files:rename', sessionId, oldPath, newPath),
    stat: (sessionId: string, path: string) => ipcRenderer.invoke('files:stat', sessionId, path),
    read: (sessionId: string, path: string) => ipcRenderer.invoke('files:read', sessionId, path),
    write: (sessionId: string, path: string, content: string) => ipcRenderer.invoke('files:write', sessionId, path, content),
    cancel: (transferId: string) => ipcRenderer.invoke('files:cancel', transferId),
  },
  app: {
    pickFile: (options) => ipcRenderer.invoke('app:pick-file', options),
    saveFile: (options) => ipcRenderer.invoke('app:save-file', options),
  },
}

contextBridge.exposeInMainWorld('api', api)

ipcRenderer.on('shell:data', (_event, sessionId: string, data: string) => {
  window.dispatchEvent(new CustomEvent('shell:data', { detail: { sessionId, data } }))
})

ipcRenderer.on('shell:close', (_event, sessionId: string) => {
  window.dispatchEvent(new CustomEvent('shell:close', { detail: { sessionId } }))
})

ipcRenderer.on('files:progress', (_event, data: { id: string; percent: number }) => {
  window.dispatchEvent(new CustomEvent('files:progress', { detail: data }))
})

ipcRenderer.on('sessions:connected', (_event, session: Session) => {
  window.dispatchEvent(new CustomEvent('sessions:connected', { detail: session }))
})

ipcRenderer.on('sessions:connect-error', (_event, error: { configId: string; error: string }) => {
  window.dispatchEvent(new CustomEvent('sessions:connect-error', { detail: error }))
})

ipcRenderer.on('menu:new-connection', () => {
  window.dispatchEvent(new CustomEvent('menu:new-connection'))
})

ipcRenderer.on('menu:open-manager', () => {
  window.dispatchEvent(new CustomEvent('menu:open-manager'))
})

ipcRenderer.on('menu:open-settings', () => {
  window.dispatchEvent(new CustomEvent('menu:open-settings'))
})

ipcRenderer.on('window:minimize', () => {
  ipcRenderer.invoke('window:minimize')
})

ipcRenderer.on('window:maximize', () => {
  ipcRenderer.invoke('window:maximize')
})

ipcRenderer.on('window:close', () => {
  ipcRenderer.invoke('window:close')
})
