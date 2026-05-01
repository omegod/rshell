import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import { SSHConnectionConfig } from '../../shared/types.js'

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
        this.connections = JSON.parse(data)
      } else {
        this.connections = []
      }
    } catch (err) {
      console.error('Failed to load connections:', err)
      this.connections = []
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.storePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.storePath, JSON.stringify(this.connections, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save connections:', err)
    }
  }

  list(): SSHConnectionConfig[] {
    return [...this.connections].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }

  get(id: string): SSHConnectionConfig | undefined {
    return this.connections.find((c) => c.id === id)
  }

  save_connection(config: SSHConnectionConfig): SSHConnectionConfig {
    const existingIndex = this.connections.findIndex((c) => c.id === config.id)

    if (existingIndex >= 0) {
      this.connections[existingIndex] = {
        ...config,
        updatedAt: new Date().toISOString(),
      }
    } else {
      const newConfig: SSHConnectionConfig = {
        ...config,
        id: config.id || `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      this.connections.push(newConfig)
    }

    this.save()
    return this.connections.find((c) => c.id === (config.id || this.connections[this.connections.length - 1].id))!
  }

  delete(id: string): boolean {
    const initialLength = this.connections.length
    this.connections = this.connections.filter((c) => c.id !== id)
    if (this.connections.length < initialLength) {
      this.save()
      return true
    }
    return false
  }
}
