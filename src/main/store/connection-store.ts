import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, safeStorage } from 'electron'
import { SSHConnectionConfig } from '../../shared/types.js'

const ENCRYPTED_PREFIX = 'safeStorage:v1:'

export class ConnectionStore {
  private storePath: string
  private connections: SSHConnectionConfig[] = []

  constructor() {
    const userDataPath = app.getPath('userData')
    this.storePath = path.join(userDataPath, 'connections.json')
    this.load()
  }

  private load(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const data = fs.readFileSync(this.storePath, 'utf-8')
        const parsed: unknown = JSON.parse(data)
        if (!Array.isArray(parsed)) {
          throw new Error('Invalid connections file')
        }
        const configs = parsed as SSHConnectionConfig[]
        const needsMigration = configs.some((config) =>
          (config.password && !config.password.startsWith(ENCRYPTED_PREFIX))
          || (config.passphrase && !config.passphrase.startsWith(ENCRYPTED_PREFIX))
        )
        this.connections = configs.map((config) => this.deserialize(config))
        if (needsMigration) {
          try {
            this.save()
          } catch (err) {
            console.error('Failed to migrate stored credentials:', err)
          }
        }
      } else {
        this.connections = []
      }
    } catch (err) {
      console.error('Failed to load connections:', err)
      this.connections = []
    }
  }

  private save(): void {
    const dir = path.dirname(this.storePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const tempPath = `${this.storePath}.tmp`
    const serialized = this.connections.map((config) => this.serialize(config))
    fs.writeFileSync(tempPath, JSON.stringify(serialized, null, 2), { encoding: 'utf-8', mode: 0o600 })
    fs.renameSync(tempPath, this.storePath)
  }

  private encryptSecret(value?: string): string | undefined {
    if (!value) return undefined
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('System credential encryption is unavailable')
    }
    return `${ENCRYPTED_PREFIX}${safeStorage.encryptString(value).toString('base64')}`
  }

  private decryptSecret(value?: string): string | undefined {
    if (!value || !value.startsWith(ENCRYPTED_PREFIX)) return value
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64'))
    } catch (err) {
      console.error('Failed to decrypt stored credential:', err)
      return undefined
    }
  }

  private serialize(config: SSHConnectionConfig): SSHConnectionConfig {
    return {
      ...config,
      password: this.encryptSecret(config.password),
      passphrase: this.encryptSecret(config.passphrase),
    }
  }

  private deserialize(config: SSHConnectionConfig): SSHConnectionConfig {
    return {
      ...config,
      password: this.decryptSecret(config.password),
      passphrase: this.decryptSecret(config.passphrase),
    }
  }

  list(): SSHConnectionConfig[] {
    return [...this.connections].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }

  get(id: string): SSHConnectionConfig | undefined {
    return this.connections.find((c) => c.id === id)
  }

  save_connection(config: SSHConnectionConfig): SSHConnectionConfig {
    const previous = [...this.connections]
    const existingIndex = this.connections.findIndex((c) => c.id === config.id)

    if (existingIndex >= 0) {
      this.connections[existingIndex] = {
        ...config,
        updatedAt: new Date().toISOString(),
      }
    } else {
      const newConfig: SSHConnectionConfig = {
        ...config,
        id: config.id || `conn_${randomUUID()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      this.connections.push(newConfig)
    }

    try {
      this.save()
    } catch (err) {
      this.connections = previous
      throw err
    }
    return this.connections.find((c) => c.id === (config.id || this.connections[this.connections.length - 1].id))!
  }

  delete(id: string): boolean {
    const previous = this.connections
    const initialLength = this.connections.length
    this.connections = this.connections.filter((c) => c.id !== id)
    if (this.connections.length < initialLength) {
      try {
        this.save()
      } catch (err) {
        this.connections = previous
        throw err
      }
      return true
    }
    return false
  }
}
