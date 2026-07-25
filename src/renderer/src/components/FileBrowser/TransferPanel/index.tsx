import React from 'react'
import { Space, Spin, Button, Progress } from 'antd'
import {
  UploadOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CaretUpOutlined,
  CaretDownOutlined,
  CloseOutlined
} from '@ant-design/icons'
import { useSessionStore } from '../../../store/useSessionStore'
import { useShallow } from 'zustand/react/shallow'

import './index.css'

interface TransferPanelProps {
  sessionId: string
  collapsed: boolean
  onToggle: () => void
  onCancel: (id: string) => void
}

export const TransferPanel: React.FC<TransferPanelProps> = ({
  sessionId,
  collapsed,
  onToggle,
  onCancel
}) => {
  const transfers = useSessionStore(useShallow((state) =>
    state.transfers.filter((transfer) => transfer.sessionId === sessionId)
  ))
  const activeTransfers = transfers.filter((t) => t.status === 'transferring')

  const formatSpeed = (speed: number) => {
    if (speed < 1) return '<1 KB/s'
    if (speed < 1024) return `${Math.round(speed)} KB/s`
    return `${(speed / 1024).toFixed(1)} MB/s`
  }

  if (transfers.length === 0) return null

  return (
    <div className="transfer-panel">
      <div className="transfer-panel-header" onClick={onToggle}>
        <Space size={6}>
          {activeTransfers.length > 0 ? (
            <Spin size="small" style={{ scale: '0.8' }} />
          ) : transfers.length > 0 ? (
            <CheckCircleOutlined style={{ color: 'var(--success)', fontSize: 12 }} />
          ) : (
            <DownloadOutlined style={{ color: 'var(--text-tertiary)', fontSize: 12 }} />
          )}
          <span className="transfer-panel-title">
            传输 {activeTransfers.length > 0 ? `(${activeTransfers.length})` : ''}
          </span>
        </Space>
        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
          {collapsed ? <CaretUpOutlined /> : <CaretDownOutlined />}
        </div>
      </div>
      {!collapsed && (
        <div className="transfer-panel-body">
          {transfers.length === 0 ? (
              <div className="transfer-panel-empty">暂无传输任务</div>
          ) : (
            [...transfers].map((t) => (
              <div key={t.id} className="transfer-item">
                <div className="transfer-item-info" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ flexShrink: 0 }}>
                    {t.direction === 'upload' ? (
                      <UploadOutlined style={{ color: 'var(--accent)', fontSize: '12px' }} />
                    ) : (
                      <DownloadOutlined style={{ color: 'var(--success)', fontSize: '12px' }} />
                    )}
                  </span>
                  <span className="transfer-item-name" style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.fileName}</span>
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {t.status === 'transferring' && (
                      <>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{formatSpeed(t.speed)}</span>
                        <Button type="text" size="small" icon={<CloseOutlined style={{ fontSize: '10px' }} />} onClick={(e) => { e.stopPropagation(); onCancel(t.id) }} />
                      </>
                    )}
                    {t.status === 'completed' && <CheckCircleOutlined style={{ color: 'var(--success)', fontSize: '12px' }} />}
                    {t.status === 'error' && <CloseCircleOutlined style={{ color: 'var(--danger)', fontSize: '12px' }} />}
                  </div>
                </div>
                {t.status === 'transferring' && (
                  <Progress percent={t.progress} size="small" showInfo={false} strokeWidth={2} strokeColor="var(--accent)" style={{ margin: 0, lineHeight: 1 }} />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
