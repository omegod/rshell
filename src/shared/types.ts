export interface SSHConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'privateKey'
  password?: string
  privateKeyPath?: string
  passphrase?: string
  createdAt: string
  updatedAt: string
}

export interface Session {
  id: string
  configId: string
  configName: string
  connected: boolean
  createdAt: string
}

export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  size: number
  permissions: string
  owner: string
  group: string
  modifiedAt: string
}

export interface FileTreeNode {
  key: string
  title: string
  isLeaf: boolean
  path: string
  children?: FileTreeNode[]
  size?: number
  permissions?: string
  modifiedAt?: string
}

export interface TerminalSize {
  cols: number
  rows: number
}

export interface TransferProgress {
  id: string
  fileName: string
  direction: 'upload' | 'download'
  transferred: number
  total: number
  speed: number
  status: 'pending' | 'transferring' | 'completed' | 'error'
  error?: string
}

export interface ConnectionTestResult {
  success: boolean
  message: string
  latency?: number
}

export interface SystemStats {
  cpu: number
  mem: {
    used: number
    total: number
  }
  net: {
    rx: number
    tx: number
  }
}

export type IPCChannel =
  | 'connections:list'
  | 'connections:save'
  | 'connections:delete'
  | 'connections:get'
  | 'connections:test'
  | 'sessions:open'
  | 'sessions:open-shell'
  | 'sessions:close'
  | 'sessions:list'
  | 'sessions:send-input'
  | 'sessions:resize'
  | 'sessions:execute'
  | 'sessions:stats'
  | 'files:list'
  | 'files:upload'
  | 'files:download'
  | 'files:delete'
  | 'files:mkdir'
  | 'files:rename'
  | 'files:stat'
  | 'files:read'
  | 'files:write'
  | 'app:pick-file'
  | 'app:save-file'

export interface RShellApi {
  connections: {
    list(): Promise<SSHConnectionConfig[]>
    save(config: SSHConnectionConfig): Promise<SSHConnectionConfig>
    delete(id: string): Promise<void>
    get(id: string): Promise<SSHConnectionConfig | null>
    test(config: Omit<SSHConnectionConfig, 'id' | 'name' | 'createdAt' | 'updatedAt'>): Promise<ConnectionTestResult>
  }
  sessions: {
    open(configId: string): Promise<Session>
    openShell(sessionId: string, size: TerminalSize): Promise<void>
    close(sessionId: string): Promise<void>
    list(): Promise<Session[]>
    sendInput(sessionId: string, data: string): void
    resize(sessionId: string, size: TerminalSize): void
    execute(sessionId: string, command: string): Promise<string>
    stats(sessionId: string): Promise<SystemStats>
  }
  files: {
    list(sessionId: string, path: string): Promise<FileInfo[]>
    upload(sessionId: string, localPath: string, remotePath: string, onProgress?: (progress: TransferProgress) => void): Promise<void>
    download(sessionId: string, remotePath: string, localPath: string, onProgress?: (progress: TransferProgress) => void): Promise<void>
    delete(sessionId: string, path: string): Promise<void>
    mkdir(sessionId: string, path: string): Promise<void>
    rename(sessionId: string, oldPath: string, newPath: string): Promise<void>
    stat(sessionId: string, path: string): Promise<FileInfo>
    read(sessionId: string, path: string): Promise<string>
    write(sessionId: string, path: string, content: string): Promise<void>
    cancel(transferId: string): Promise<void>
  }
  app: {
    pickFile(options?: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>
    saveFile(options?: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>
  }
}
