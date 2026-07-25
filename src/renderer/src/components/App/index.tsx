import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Layout, message, Button, ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { PlusOutlined, DisconnectOutlined } from '@ant-design/icons'
import { Session, SSHConnectionConfig, FileInfo } from '../../../../shared/types'
import TabBar from '../TabBar'
import FileBrowser from '../FileBrowser'
import Terminal from '../Terminal'
import StatusBar from '../Terminal/StatusBar'
import ConnectionDialog from '../ConnectionDialog'
import ConnectionManager from '../ConnectionManager'
import FileEditor from '../FileEditor'
import SettingsDialog from '../SettingsDialog'

import { useConnectionStore } from '../../store/useConnectionStore'
import { useSessionStore } from '../../store/useSessionStore'

import './index.css'

const { Content } = Layout

interface SessionState {
  session: Session
  currentPath: string
}

type ThemeMode = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface AppSettings {
  theme: ThemeMode
  terminalFontSize: number
}

const DEFAULT_SETTINGS: AppSettings = { theme: 'system', terminalFontSize: 14 }

function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem('rshell-settings')
    if (!saved) return DEFAULT_SETTINGS
    const parsed = JSON.parse(saved) as Partial<AppSettings>
    return {
      theme: parsed.theme === 'dark' || parsed.theme === 'light' || parsed.theme === 'system'
        ? parsed.theme
        : 'system',
      terminalFontSize: typeof parsed.terminalFontSize === 'number' ? parsed.terminalFontSize : 14,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const [sessions, setSessions] = useState<SessionState[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [showConnectionManager, setShowConnectionManager] = useState(false)
  const [showNewConnection, setShowNewConnection] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme)
  const [editingConfig, setEditingConfig] = useState<SSHConnectionConfig | null>(null)
  const [editingFile, setEditingFile] = useState<{ file: FileInfo; sessionId: string } | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarWidthRef = React.useRef(288)
  const [messageApi, contextHolder] = message.useMessage()
  const updateTransfer = useSessionStore((state) => state.updateTransfer)
  const removeSessionState = useSessionStore((state) => state.removeSession)

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(600, e.clientX))
      sidebarWidthRef.current = newWidth
      document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`)
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

    const handleOpenSettings = () => {
      setShowSettings(true)
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

    window.addEventListener('menu:new-connection', handleNewConnection)
    window.addEventListener('menu:open-manager', handleOpenManager)
    window.addEventListener('menu:open-settings', handleOpenSettings)
    window.addEventListener('shell:close', handleShellClose)

    return () => {
      window.removeEventListener('menu:new-connection', handleNewConnection)
      window.removeEventListener('menu:open-manager', handleOpenManager)
      window.removeEventListener('menu:open-settings', handleOpenSettings)
      window.removeEventListener('shell:close', handleShellClose)
    }
  }, [messageApi])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const effectiveTheme: ResolvedTheme = settings.theme === 'system' ? systemTheme : settings.theme

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme
  }, [effectiveTheme])

  useEffect(() => {
    const handleProgress = (event: Event) => {
      const { id, percent, speed } = (event as CustomEvent).detail
      updateTransfer(id, { progress: percent, speed: speed || 0 })
    }
    window.addEventListener('files:progress', handleProgress)
    return () => window.removeEventListener('files:progress', handleProgress)
  }, [updateTransfer])

  const handleConnect = useCallback(async (config: SSHConnectionConfig) => {
    try {
      const session = await window.api.sessions.open(config.id)
      let initialPath = '~'
      try {
        initialPath = await window.api.files.resolve(session.id, '~')
      } catch {
        // The file browser can still retry the home path directly.
      }
      setSessions((prev) => [...prev, { session, currentPath: initialPath }])
      setActiveSessionId(session.id)
      setShowNewConnection(false)
      setShowConnectionManager(false)
      messageApi.success(`已连接到 ${session.configName}`)
    } catch (err) {
      messageApi.error(`连接失败: ${err instanceof Error ? err.message : '未知错误'}`)
      throw err
    }
  }, [messageApi])

  const handleDisconnect = useCallback(async (sessionId: string) => {
    try {
      await window.api.sessions.close(sessionId)
    } catch {
      // ignore
    }
    setSessions((prev) => prev.filter((s) => s.session.id !== sessionId))
    removeSessionState(sessionId)
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter((s) => s.session.id !== sessionId)
      setActiveSessionId(remaining.length > 0 ? remaining[0].session.id : null)
    }
  }, [activeSessionId, sessions, removeSessionState])

  const handlePathChange = useCallback((sessionId: string, path: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.session.id === sessionId ? { ...s, currentPath: path } : s
      )
    )
  }, [])

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings)
    localStorage.setItem('rshell-settings', JSON.stringify(newSettings))
    messageApi.success('设置已保存')
  }

  const addConnection = useConnectionStore((state) => state.addConnection)

  const isDark = effectiveTheme === 'dark'
  const antdTheme = useMemo(() => ({
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: isDark ? '#6b82ff' : '#4f6df5',
      colorPrimaryHover: isDark ? '#7d92ff' : '#3f5ce8',
      colorPrimaryActive: isDark ? '#5468e8' : '#3550d4',
      colorLink: isDark ? '#6b82ff' : '#4f6df5',
      colorText: isDark ? '#f5f5f7' : '#1d1d1f',
      colorTextSecondary: isDark ? '#98989d' : '#6e6e73',
      colorTextTertiary: isDark ? '#636366' : '#aeaeb2',
      colorBorder: isDark ? '#3a3a3e' : '#d8d8dc',
      colorBgContainer: isDark ? '#2c2c30' : '#ffffff',
      colorBgElevated: isDark ? '#2b2b2f' : '#ffffff',
      colorBgLayout: isDark ? '#1e1e21' : '#f5f5f7',
      borderRadius: 6,
      fontSize: 13,
      controlHeight: 28,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", Arial, sans-serif',
    },
    components: {
      Button: {
        borderRadius: 6,
        controlHeight: 28,
        fontWeight: 500,
      },
      Input: {
        controlHeight: 28,
        borderRadius: 6,
        activeShadow: '0 0 0 3px var(--focus-ring)',
      },
      InputNumber: {
        controlHeight: 28,
        borderRadius: 6,
        activeShadow: '0 0 0 3px var(--focus-ring)',
      },
      Select: {
        controlHeight: 28,
        borderRadius: 6,
      },
      Modal: {
        borderRadiusLG: 10,
        paddingContentHorizontalLG: 20,
      },
      Tree: {
        indentSize: 10,
      },
      Dropdown: {
        borderRadiusLG: 8,
      },
    },
  }), [isDark])

  return (
    <ConfigProvider locale={zhCN} theme={antdTheme}>
      {contextHolder}
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
            onOpenSettings={() => setShowSettings(true)}
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
                    <div className="session-left">
                      <FileBrowser
                        sessionId={s.session.id}
                        currentPath={s.currentPath}
                        onPathChange={(path) => handlePathChange(s.session.id, path)}
                        onEditFile={(file) => setEditingFile({ file, sessionId: s.session.id })}
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
                        fontSize={settings.terminalFontSize}
                      />
                      <StatusBar
                        sessionId={s.session.id}
                        isActive={s.session.id === activeSessionId}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="disconnected-overlay">
                    <div className="disconnected-content">
                      <div className="disconnected-icon">
                        <DisconnectOutlined />
                      </div>
                      <h2>连接已断开</h2>
                      <p>与 {s.session.configName} 的会话已断开</p>
                      <Button type="primary" onClick={() => handleDisconnect(s.session.id)}>
                        关闭标签页
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <ConnectionManager
              embedded
              open
              onClose={() => {}}
              onConnect={handleConnect}
              onEdit={(config) => {
                setEditingConfig(config)
                setShowNewConnection(true)
              }}
            />
          )}
        </Content>
      </Layout>

      {sessions.length > 0 && (
        <ConnectionManager
          open={showConnectionManager}
          onClose={() => setShowConnectionManager(false)}
          onConnect={handleConnect}
          onEdit={(config) => {
            setEditingConfig(config)
            setShowNewConnection(true)
          }}
        />
      )}

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
            const saved = await window.api.connections.save(config)
            addConnection(saved)
            return saved
          } catch (err) {
            messageApi.error(`保存失败: ${err instanceof Error ? err.message : '未知错误'}`)
            throw err
          }
        }}
      />

      {editingFile && (
        <FileEditor
          open
          sessionId={editingFile.sessionId}
          filePath={editingFile.file.path}
          fileName={editingFile.file.name}
          colorTheme={effectiveTheme}
          onClose={() => {
            setEditingFile(null)
          }}
        />
      )}

      <SettingsDialog
        open={showSettings}
        settings={settings}
        onClose={() => setShowSettings(false)}
        onSave={handleSaveSettings}
      />
    </ConfigProvider>
  )
}

export default App
