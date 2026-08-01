import React, { useEffect, useRef, useState } from 'react'
import { DashboardOutlined, CloudDownloadOutlined, CloudUploadOutlined } from '@ant-design/icons'
import { SystemStats } from '../../../../shared/types'
import { resolveTerminalStatus } from './index'

interface StatusBarProps {
  sessionId: string
  isActive: boolean
  terminalBackground?: 'black' | 'white' | 'theme'
  effectiveTheme?: 'light' | 'dark'
}

const StatusBar: React.FC<StatusBarProps> = ({
  sessionId,
  isActive,
  terminalBackground = 'theme',
  effectiveTheme = 'dark',
}) => {
  const statusVars = resolveTerminalStatus(terminalBackground, effectiveTheme)
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [netSpeed, setNetSpeed] = useState<{ up: number; down: number }>({ up: 0, down: 0 })
  const prevNetRef = useRef<{ rx: number; tx: number; time: number } | null>(null)
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      if (cancelled) return
      if (!isActiveRef.current) {
        timer = setTimeout(poll, 2000)
        return
      }

      let nextDelay = 2000
      try {
        const newStats = await window.api.sessions.stats(sessionId)
        if (cancelled) return
        const now = Date.now()
        const prev = prevNetRef.current
        let speed = { up: 0, down: 0 }
        if (prev) {
          const dt = (now - prev.time) / 1000
          if (dt > 0) {
            speed = {
              down: Math.max(0, (newStats.net.rx - prev.rx) / dt),
              up: Math.max(0, (newStats.net.tx - prev.tx) / dt),
            }
          }
        }
        prevNetRef.current = { rx: newStats.net.rx, tx: newStats.net.tx, time: now }
        setStats(newStats)
        setNetSpeed(speed)
        setUnavailable(false)
      } catch {
        if (cancelled) return
        setUnavailable(true)
        nextDelay = 10000
      }
      timer = setTimeout(poll, nextDelay)
    }

    poll()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [sessionId])

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  }

  return (
    <div className="terminal-status-bar" style={{ ...statusVars } as React.CSSProperties}>
      {stats ? (
        <>
          <div className="status-group">
            <span className="status-item">
              <DashboardOutlined />
              <span>CPU <span className="status-item-value">{stats.cpu.toFixed(1)}%</span></span>
            </span>
            <span className="status-item">
              <span>MEM <span className="status-item-value">{stats.mem.used} / {stats.mem.total} MB ({((stats.mem.used / stats.mem.total) * 100).toFixed(0)}%)</span></span>
            </span>
          </div>
          <div className="status-group">
            <span className="status-item">
              <CloudDownloadOutlined className="status-down" />
              <span className="status-item-value">{formatSpeed(netSpeed.down)}</span>
            </span>
            <span className="status-item">
              <CloudUploadOutlined className="status-up" />
              <span className="status-item-value">{formatSpeed(netSpeed.up)}</span>
            </span>
          </div>
        </>
      ) : unavailable ? (
        <div className="status-hint">系统监控不可用（仅支持 Linux）</div>
      ) : (
        <div className="status-hint">正在读取系统状态…</div>
      )}
    </div>
  )
}

export default React.memo(StatusBar)
