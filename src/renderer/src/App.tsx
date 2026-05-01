import React, { useState, useEffect, useCallback } from 'react'
import { Layout, message, Button, ConfigProvider, theme } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { Session, SSHConnectionConfig, FileInfo } from '../../shared/types'
import TabBar from './components/TabBar'
import FileBrowser from './components/FileBrowser'
import Terminal from './components/Terminal'
import ConnectionDialog from './components/ConnectionDialog'
import ConnectionManager from './components/ConnectionManager'
import FileEditor from './components/FileEditor'

const { Content } = Layout

interface SessionState {
  session: Session
  currentPath: string
}

function App() {
  const [sessions, setSessions] = useState<SessionState[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [showConnectionManager, setShowConnectionManager] = useState(true)
  const [showNewConnection, setShowNewConnection] = useState(false)
  const [editingConfig, setEditingConfig] = useState<SSHConnectionConfig | null>(null)
  const [editingFile, setEditingFile] = useState<FileInfo | null>(null)
  const [lastUpdatedFile, setLastUpdatedFile] = useState<FileInfo | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(288)
  const [isResizing, setIsResizing] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(600, e.clientX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  useEffect(() => {
    const handleNewConnection = () => {
      setEditingConfig(null)
      setShowNewConnection(true)
    }

    const handleOpenManager = () => {
      setShowConnectionManager(true)
    }

    const handleShellData = (e: Event) => {
      const { sessionId, data } = (e as CustomEvent).detail
      window.dispatchEvent(new CustomEvent('terminal:input', { detail: { sessionId, data } }))
    }

    const handleShellClose = (e: Event) => {
      const { sessionId } = (e as CustomEvent).detail
      setSessions((prev) =>
        prev.map((s) =>
          s.session.id === sessionId
            ? { ...s, session: { ...s.session, connected: false } }
            : s
        )
      )
      messageApi.warning('连接已断开')
    }

    const handleSessionConnected = (e: Event) => {
      const session = (e as CustomEvent).detail as Session
      const newState: SessionState = {
        session,
        currentPath: '~',
      }
      setSessions((prev) => [...prev, newState])
      setActiveSessionId(session.id)
      setShowNewConnection(false)
      setShowConnectionManager(false)
      messageApi.success(`已连接到 ${session.configName}`)
    }

    const handleConnectError = (e: Event) => {
      const { error } = (e as CustomEvent).detail
      messageApi.error(`连接失败: ${error}`)
    }

    window.addEventListener('menu:new-connection', handleNewConnection)
    window.addEventListener('menu:open-manager', handleOpenManager)
    window.addEventListener('shell:data', handleShellData)
    window.addEventListener('shell:close', handleShellClose)
    window.addEventListener('sessions:connected', handleSessionConnected)
    window.addEventListener('sessions:connect-error', handleConnectError)

    return () => {
      window.removeEventListener('menu:new-connection', handleNewConnection)
      window.removeEventListener('menu:open-manager', handleOpenManager)
      window.removeEventListener('shell:data', handleShellData)
      window.removeEventListener('shell:close', handleShellClose)
      window.removeEventListener('sessions:connected', handleSessionConnected)
      window.removeEventListener('sessions:connect-error', handleConnectError)
    }
  }, [messageApi])

  const handleConnect = useCallback(async (config: SSHConnectionConfig) => {
    try {
      await window.api.sessions.open(config.id)
    } catch (err) {
      messageApi.error(`连接失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }, [messageApi])

  const handleDisconnect = useCallback(async (sessionId: string) => {
    try {
      await window.api.sessions.close(sessionId)
    } catch {
      // ignore
    }
    setSessions((prev) => prev.filter((s) => s.session.id !== sessionId))
    if (activeSessionId === sessionId) {
      setActiveSessionId((prev) => {
        const remaining = sessions.filter((s) => s.session.id !== sessionId)
        return remaining.length > 0 ? remaining[0].session.id : null
      })
    }
    messageApi.success('已断开连接')
  }, [activeSessionId, sessions, messageApi])

  const handlePathChange = useCallback((sessionId: string, path: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.session.id === sessionId ? { ...s, currentPath: path } : s
      )
    )
  }, [])

  const activeSession = sessions.find((s) => s.session.id === activeSessionId)

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
        },
        components: {
          Modal: {
            headerBg: '#f5f5f5',
            contentBg: '#ffffff',
            footerBg: '#ffffff',
          },
          Table: {
            headerBg: '#f5f5f5',
            headerColor: '#6e6e73',
            headerBorderRadius: 0,
          },
        },
      }}
    >
      {contextHolder}
      <div className="titlebar">
        <div className="titlebar-spacer" />
        <div className="titlebar-title">RShell</div>
        <div className="titlebar-spacer" />
      </div>
      <Layout className="app-layout">
        {sessions.length > 0 && (
          <TabBar
            sessions={sessions.map((s) => s.session)}
            activeSessionId={activeSessionId}
            onTabClick={setActiveSessionId}
            onTabClose={handleDisconnect}
            onNewConnection={() => {
              setEditingConfig(null)
              setShowNewConnection(true)
            }}
            onOpenManager={() => setShowConnectionManager(true)}
          />
        )}
        <Content className="app-content">
          {sessions.length > 0 ? (
            sessions.map((s) => (
              <div
                key={s.session.id}
                className="session-container"
                style={{ display: s.session.id === activeSessionId ? 'block' : 'none', height: '100%' }}
              >
                {s.session.connected ? (
                  <div className="session-content">
                    <div className="session-left" style={{ width: sidebarWidth }}>
                      <FileBrowser
                        sessionId={s.session.id}
                        currentPath={s.currentPath}
                        onPathChange={(path) => handlePathChange(s.session.id, path)}
                        onEditFile={(file) => setEditingFile(file)}
                        updatedFile={lastUpdatedFile}
                      />
                    </div>
                    <div
                      className={`session-divider ${isResizing ? 'resizing' : ''}`}
                      onMouseDown={() => setIsResizing(true)}
                    />
                    <div className="session-right">
                      <Terminal
                        sessionId={s.session.id}
                        isActive={s.session.id === activeSessionId}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="disconnected-overlay">
                    <div className="disconnected-content">
                      <h2>连接已断开</h2>
                      <p>此会话已断开连接。</p>
                      <Button type="primary" onClick={() => handleDisconnect(s.session.id)}>
                        关闭标签页
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-state-content">
                <h1>RShell</h1>
                <p>轻量、高效的远程终端与文件管理工具</p>
                <Button
                  type="primary"
                  size="large"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setShowConnectionManager(true)
                  }}
                >
                  打开连接
                </Button>
              </div>
            </div>
          )}
        </Content>
      </Layout>

      <ConnectionManager
        open={showConnectionManager}
        onClose={() => setShowConnectionManager(false)}
        onConnect={handleConnect}
        onEdit={(config) => {
          setEditingConfig(config)
          setShowNewConnection(true)
        }}
      />

      <ConnectionDialog
        open={showNewConnection}
        editingConfig={editingConfig}
        onClose={() => {
          setShowNewConnection(false)
          setEditingConfig(null)
        }}
        onConnect={handleConnect}
        onSave={async (config) => {
          try {
            await window.api.connections.save(config)
            messageApi.success('保存成功')
          } catch (err) {
            messageApi.error(`保存失败: ${err instanceof Error ? err.message : '未知错误'}`)
          }
        }}
      />

      {activeSession && editingFile && (
        <FileEditor
          open={!!editingFile}
          sessionId={activeSession.session.id}
          filePath={editingFile.path}
          fileName={editingFile.name}
          onClose={() => setEditingFile(null)}
          onSave={(file) => setLastUpdatedFile(file)}
        />
      )}
    </ConfigProvider>
  )
}

export default App
