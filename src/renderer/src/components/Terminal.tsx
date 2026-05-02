import React, { useEffect, useRef, useState } from 'react'
import { Spin, Space } from 'antd'
import { Terminal as XTerminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { DashboardOutlined, CloudDownloadOutlined, CloudUploadOutlined } from '@ant-design/icons'
import '@xterm/xterm/css/xterm.css'
import { SystemStats } from '../../../shared/types'

interface TerminalProps {
  sessionId: string
  isActive: boolean
  fontSize?: number
}

const Terminal: React.FC<TerminalProps> = ({ sessionId, isActive, fontSize = 14 }) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<SystemStats | null>(null)
  const prevNetRef = useRef<{ rx: number; tx: number; time: number } | null>(null)
  const [netSpeed, setNetSpeed] = useState<{ up: number; down: number }>({ up: 0, down: 0 })
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  useEffect(() => {
    if (!terminalRef.current) return

    const xterm = new XTerminal({
      fontFamily: '"SF Mono", "Menlo", "Monaco", "Courier New", monospace',
      fontSize: fontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        selectionForeground: '#ffffff',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d917',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      },
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    const unicode11Addon = new Unicode11Addon()

    xterm.loadAddon(fitAddon)
    xterm.loadAddon(webLinksAddon)
    xterm.loadAddon(unicode11Addon)

    // 激活 Unicode 11 以正确处理宽字符（如 🔥）
    xterm.unicode.activeVersion = '11'

    xterm.open(terminalRef.current)

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    const handleInput = (data: string) => {
      window.api.sessions.sendInput(sessionId, data)
    }

    const handleResize = (event: { cols: number; rows: number }) => {
      window.api.sessions.resize(sessionId, {
        cols: event.cols,
        rows: event.rows,
      })
    }

    xterm.onData(handleInput)
    xterm.onResize(handleResize)

    const handleTerminalInput = (e: Event) => {
      if (!isActiveRef.current) return
      const { sessionId: eventSessionId, data } = (e as CustomEvent).detail
      if (eventSessionId === sessionId) {
        xterm.write(data)
      }
    }

    const handleTerminalClose = (e: Event) => {
      if (!isActiveRef.current) return
      const { sessionId: eventSessionId } = (e as CustomEvent).detail
      if (eventSessionId === sessionId) {
        xterm.write('\r\n\x1b[31m[Connection closed]\x1b[0m\r\n')
      }
    }

    window.addEventListener('terminal:input', handleTerminalInput)
    window.addEventListener('shell:close', handleTerminalClose)

    // 定时获取系统状态
    const statsInterval = setInterval(async () => {
      if (!isActiveRef.current) return
      try {
        const newStats = await window.api.sessions.stats(sessionId)
        setStats(newStats)

        const now = Date.now()
        const prev = prevNetRef.current
        if (prev) {
          const dt = (now - prev.time) / 1000
          if (dt > 0) {
            setNetSpeed({
              down: Math.max(0, (newStats.net.rx - prev.rx) / dt),
              up: Math.max(0, (newStats.net.tx - prev.tx) / dt)
            })
          }
        }
        prevNetRef.current = { rx: newStats.net.rx, tx: newStats.net.tx, time: now }
      } catch (e) {
        // 静默失败
      }
    }, 2000)

    let fitTimeout: ReturnType<typeof setTimeout>
    const resizeObserver = new ResizeObserver(() => {
      if (!isActiveRef.current) return
      clearTimeout(fitTimeout)
      fitTimeout = setTimeout(() => {
        try {
          fitAddon.fit()
        } catch {
          // ignore
        }
      }, 50)
    })

    resizeObserver.observe(terminalRef.current)

    setTimeout(() => {
      try {
        fitAddon.fit()
      } catch {
        // ignore
      }
      setLoading(false)
    }, 100)

    return () => {
      clearTimeout(fitTimeout)
      resizeObserver.disconnect()
      window.removeEventListener('terminal:input', handleTerminalInput)
      window.removeEventListener('shell:close', handleTerminalClose)
      clearInterval(statsInterval)
      xterm.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId])

  useEffect(() => {
    if (xtermRef.current && fitAddonRef.current) {
      xtermRef.current.options.fontSize = fontSize
      try {
        fitAddonRef.current.fit()
      } catch {
        // ignore
      }
    }
  }, [fontSize])

  useEffect(() => {
    if (isActive && xtermRef.current) {
      const timer = setTimeout(() => {
        try {
          xtermRef.current?.focus()
        } catch {
          // ignore
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1e1e1e' }}>
      <div className="terminal-container" style={{ flex: 1, position: 'relative' }}>
        {loading && (
          <div className="terminal-loading">
            <Spin />
          </div>
        )}
        <div
          ref={terminalRef}
          className={`terminal-wrapper ${loading ? 'hidden' : ''}`}
          style={{ height: '100%' }}
        />
      </div>
      
      {/* 终端状态栏 */}
      <div style={{
        height: '24px',
        backgroundColor: '#2d2d2d',
        borderTop: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        fontSize: '11px',
        color: '#aaa',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        {stats ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Space size={4}>
                <DashboardOutlined style={{ fontSize: '12px' }} />
                <span>CPU: {stats.cpu.toFixed(1)}%</span>
              </Space>
              <Space size={4}>
                <span style={{ opacity: 0.8 }}>MEM:</span>
                <span>{stats.mem.used} / {stats.mem.total} MB</span>
                <span style={{ opacity: 0.6 }}>({((stats.mem.used / stats.mem.total) * 100).toFixed(0)}%)</span>
              </Space>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Space size={4}>
                <CloudDownloadOutlined style={{ color: '#52c41a' }} />
                <span>{formatSpeed(netSpeed.down)}</span>
              </Space>
              <Space size={4}>
                <CloudUploadOutlined style={{ color: '#1677ff' }} />
                <span>{formatSpeed(netSpeed.up)}</span>
              </Space>
            </div>
          </>
        ) : (
          <div style={{ opacity: 0.5 }}>系统监控不可用 (仅支持 Linux)</div>
        )}
      </div>
    </div>
  )
}

export default Terminal
