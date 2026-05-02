import { create } from 'zustand'
import { SSHConnectionConfig } from '../../../shared/types'

interface ConnectionState {
  connections: SSHConnectionConfig[]
  loading: boolean
  
  // Actions
  fetchConnections: () => Promise<void>
  addConnection: (config: SSHConnectionConfig) => void
  removeConnection: (id: string) => void
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connections: [],
  loading: false,

  fetchConnections: async () => {
    set({ loading: true })
    try {
      const list = await window.api.connections.list()
      set({ connections: list, loading: false })
    } catch (err) {
      set({ loading: false })
      console.error('Failed to fetch connections:', err)
    }
  },

  addConnection: (config) => set((state) => {
    const exists = state.connections.findIndex((c) => c.id === config.id)
    if (exists !== -1) {
      const next = [...state.connections]
      next[exists] = config
      return { connections: next }
    }
    return { connections: [config, ...state.connections] }
  }),

  removeConnection: (id) => set((state) => ({
    connections: state.connections.filter((c) => c.id !== id)
  }))
}))
