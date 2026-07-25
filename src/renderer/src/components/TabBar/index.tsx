import React from 'react'
import { Dropdown } from 'antd'
import { PlusOutlined, SettingOutlined, CloseOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Session } from '../../../../shared/types'

import './index.css'

interface TabBarProps {
  sessions: Session[]
  activeSessionId: string | null
  onTabClick: (sessionId: string) => void
  onTabClose: (sessionId: string) => void
  onNewConnection: () => void
  onOpenManager: () => void
  onOpenSettings: () => void
}

const TabBar: React.FC<TabBarProps> = ({
  sessions,
  activeSessionId,
  onTabClick,
  onTabClose,
  onNewConnection,
  onOpenManager,
  onOpenSettings,
}) => {
  return (
    <div className="tab-bar">
      <div className="tab-bar-actions">
        <Dropdown
          menu={{
            items: [
              { key: 'new', label: '新建连接', icon: <PlusOutlined />, onClick: onNewConnection },
              { key: 'manager', label: '连接管理', icon: <UnorderedListOutlined />, onClick: onOpenManager },
            ],
          }}
          trigger={['click']}
          placement="bottomLeft"
        >
          <button type="button" className="tab-bar-icon-btn" title="新建连接">
            <PlusOutlined />
          </button>
        </Dropdown>
      </div>

      <div className="tab-strip">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId
          return (
            <div
              key={session.id}
              className={`tab-item ${isActive ? 'active' : ''}`}
              onClick={() => onTabClick(session.id)}
              title={session.configName}
            >
              <span className={`tab-status ${session.connected ? 'connected' : 'disconnected'}`} />
              <span className="tab-title">{session.configName}</span>
              <button
                type="button"
                className="tab-close"
                title="关闭"
                onClick={(e) => {
                  e.stopPropagation()
                  onTabClose(session.id)
                }}
              >
                <CloseOutlined />
              </button>
            </div>
          )
        })}
      </div>

      <div className="tab-bar-actions">
        <button type="button" className="tab-bar-icon-btn" title="设置" onClick={onOpenSettings}>
          <SettingOutlined />
        </button>
      </div>
    </div>
  )
}

export default TabBar
