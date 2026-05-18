import React, { useEffect, useRef, useState } from 'react'
import { Space } from 'antd'
import { DashboardOutlined, CloudDownloadOutlined, CloudUploadOutlined } from '@ant-design/icons'
import { SystemStats } from '../../../../shared/types'

interface StatusBarProps {
  sessionId: string
  isActive: boolean
}

const StatusBar: React.FC<StatusBarProps> = ({ sessionId, isActive }) => {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [netSpeed, setNetSpeed] = useState<{ up: number; down: number }>({ up: 0, down: 0 })
  const prevNetRef = useRef<{ rx: number; tx: number; time: number } | null>(null)
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  useEffect(() => {
    const statsInterval = setInterval(async () => {
      if (!isActiveRef.current) return
      try {
        const newStats = await window.api.sessions.stats(sessionId)
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
      } catch {
        // ignore
      }
    }, 2000)

    return () => clearInterval(statsInterval)
  }, [sessionId])

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  }

  return (
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
  )
}

export default React.memo(StatusBar)
