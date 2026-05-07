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

import './index.css'

interface TransferPanelProps {
  collapsed: boolean
  onToggle: () => void
  onCancel: (id: string) => void
}

export const TransferPanel: React.FC<TransferPanelProps> = ({
  collapsed,
  onToggle,
  onCancel
}) => {
  const transfers = useSessionStore((state) => state.transfers)
  const activeTransfers = transfers.filter((t) => t.status === 'transferring')

  const formatSpeed = (speed: number) => {
    if (speed < 1) return '<1 KB/s'
    if (speed < 1024) return `${Math.round(speed)} KB/s`
    return `${(speed / 1024).toFixed(1)} MB/s`
  }

  return (
    <div className="transfer-panel">
      <div className="transfer-panel-header" onClick={onToggle}>
        <Space size={6}>
          {activeTransfers.length > 0 ? (
            <Spin size="small" style={{ scale: '0.8' }} />
          ) : transfers.length > 0 ? (
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
          ) : (
            <DownloadOutlined style={{ color: '#8e8e93', fontSize: 12 }} />
          )}
          <span className="transfer-panel-title">
            传输队列 {activeTransfers.length > 0 ? `(${activeTransfers.length})` : ''}
          </span>
        </Space>
        <div style={{ fontSize: '10px', color: '#bfbfbf' }}>
          {collapsed ? <CaretUpOutlined /> : <CaretDownOutlined />}
        </div>
      </div>
      {!collapsed && (
        <div className="transfer-panel-body">
          {transfers.length === 0 ? (
            <div className="transfer-panel-empty" style={{ padding: '20px 0', textAlign: 'center', fontSize: '12px', color: '#bfbfbf' }}>暂无传输任务</div>
          ) : (
            [...transfers].map((t) => (
              <div key={t.id} className="transfer-item">
                <div className="transfer-item-info" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ flexShrink: 0 }}>
                    {t.direction === 'upload' ? (
                      <UploadOutlined style={{ color: '#1677ff', fontSize: '12px' }} />
                    ) : (
                      <DownloadOutlined style={{ color: '#52c41a', fontSize: '12px' }} />
                    )}
                  </span>
                  <span className="transfer-item-name" style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.fileName}</span>
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {t.status === 'transferring' && (
                      <>
                        <span style={{ fontSize: '10px', color: '#8c8c8c' }}>{formatSpeed(t.speed)}</span>
                        <Button type="text" size="small" icon={<CloseOutlined style={{ fontSize: '10px' }} />} onClick={(e) => { e.stopPropagation(); onCancel(t.id) }} />
                      </>
                    )}
                    {t.status === 'completed' && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '12px' }} />}
                    {t.status === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: '12px' }} />}
                  </div>
                </div>
                {t.status === 'transferring' && (
                  <Progress percent={t.progress} size="small" showInfo={false} strokeWidth={2} strokeColor="#1677ff" style={{ margin: 0, lineHeight: 1 }} />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
