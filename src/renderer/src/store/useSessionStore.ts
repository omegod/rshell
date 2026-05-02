import { create } from 'zustand'
import { FileInfo, Session } from '../../../shared/types'

export interface TransferItem {
  id: string
  fileName: string
  progress: number
  speed: number
  direction: 'upload' | 'download'
  status: 'pending' | 'transferring' | 'completed' | 'error'
  remotePath: string
  startTime: number
}

interface SessionState {
  activeSessionId: string | null
  sessions: Record<string, {
    currentPath: string
    files: FileInfo[]
    childrenMap: Record<string, FileInfo[]>
    loadedKeys: string[]
    expandedKeys: string[]
  }>
  transfers: TransferItem[]
  
  // Actions
  setActiveSession: (id: string | null) => void
  setPath: (sessionId: string, path: string) => void
  setFiles: (sessionId: string, files: FileInfo[]) => void
  updateChildren: (sessionId: string, dirPath: string, children: FileInfo[]) => void
  setLoadedKeys: (sessionId: string, keys: string[] | ((prev: string[]) => string[])) => void
  setExpandedKeys: (sessionId: string, keys: string[]) => void
  
  // Transfer Actions
  addTransfer: (transfer: TransferItem) => void
  updateTransfer: (id: string, updates: Partial<TransferItem>) => void
  clearCompletedTransfers: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  activeSessionId: null,
  sessions: {},
  transfers: [],

  setActiveSession: (id) => set({ activeSessionId: id }),

  setPath: (sessionId, path) => set((state) => ({
    sessions: {
      ...state.sessions,
      [sessionId]: {
        ...(state.sessions[sessionId] || { files: [], childrenMap: {}, loadedKeys: [], expandedKeys: [] }),
        currentPath: path
      }
    }
  })),

  setFiles: (sessionId, files) => set((state) => ({
    sessions: {
      ...state.sessions,
      [sessionId]: {
        ...(state.sessions[sessionId] || { currentPath: '~', childrenMap: {}, loadedKeys: [], expandedKeys: [] }),
        files
      }
    }
  })),

  updateChildren: (sessionId, dirPath, children) => set((state) => ({
    sessions: {
      ...state.sessions,
      [sessionId]: {
        ...(state.sessions[sessionId] || { currentPath: '~', files: [], loadedKeys: [], expandedKeys: [] }),
        childrenMap: {
          ...(state.sessions[sessionId]?.childrenMap || {}),
          [dirPath]: children
        }
      }
    }
  })),

  setLoadedKeys: (sessionId, keysOrFn) => set((state) => {
    const prevKeys = state.sessions[sessionId]?.loadedKeys || []
    const nextKeys = typeof keysOrFn === 'function' ? keysOrFn(prevKeys) : keysOrFn
    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...(state.sessions[sessionId] || { currentPath: '~', files: [], childrenMap: [], expandedKeys: [] }),
          loadedKeys: nextKeys
        }
      }
    }
  }),

  setExpandedKeys: (sessionId, keys) => set((state) => ({
    sessions: {
      ...state.sessions,
      [sessionId]: {
        ...(state.sessions[sessionId] || { currentPath: '~', files: [], childrenMap: {}, loadedKeys: [] }),
        expandedKeys: keys
      }
    }
  })),

  addTransfer: (transfer) => set((state) => ({
    transfers: [transfer, ...state.transfers]
  })),

  updateTransfer: (id, updates) => set((state) => ({
    transfers: state.transfers.map((t) => (t.id === id ? { ...t, ...updates } : t))
  })),

  clearCompletedTransfers: () => set((state) => ({
    transfers: state.transfers.filter((t) => t.status === 'transferring' || t.status === 'pending')
  }))
}))
