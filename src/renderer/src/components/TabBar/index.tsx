import React from 'react'
import { Tabs, Button, Tooltip, Dropdown } from 'antd'
import { PlusOutlined, SettingOutlined, CloseOutlined } from '@ant-design/icons'
import { Session } from '../../../../shared/types'

import './index.css'

interface TabBarProps {
  sessions: Session[]
  activeSessionId: string | null
  onTabClick: (sessionId: string) => void
  onTabClose: (sessionId: string) => void
  onNewConnection: () => void
  onOpenManager: () => void
}

const TabBar: React.FC<TabBarProps> = ({
  sessions,
  activeSessionId,
  onTabClick,
  onTabClose,
  onNewConnection,
  onOpenManager,
}) => {
  const items = sessions.map((session) => ({
    key: session.id,
    label: (
      <div className="tab-label">
        <span className="tab-title">{session.configName}</span>
        <span className={`tab-status ${session.connected ? 'connected' : 'disconnected'}`} />
      </div>
    ),
    closable: true,
    closeIcon: (
      <CloseOutlined
        onClick={(e) => {
          e.stopPropagation()
          onTabClose(session.id)
        }}
      />
    ),
  }))

  return (
    <div className="tab-bar">
      <div className="tab-bar-left">
        <Dropdown
          menu={{
            items: [
              {
                key: 'new',
                label: '新建连接',
                icon: <PlusOutlined />,
                onClick: onNewConnection,
              },
              {
                key: 'manager',
                label: '连接管理',
                icon: <SettingOutlined />,
                onClick: onOpenManager,
              },
            ],
          }}
          trigger={['click']}
        >
          <Button type="text" icon={<PlusOutlined />} className="new-tab-button" />
        </Dropdown>
      </div>
      <div className="tab-bar-center">
        {sessions.length > 0 && (
          <Tabs
            type="editable-card"
            hideAdd
            activeKey={activeSessionId || undefined}
            items={items}
            onChange={(key) => onTabClick(key)}
            onEdit={(targetKey, action) => {
              if (action === 'remove' && typeof targetKey === 'string') {
                onTabClose(targetKey)
              }
            }}
            size="small"
          />
        )}
      </div>
    </div>
  )
}

export default TabBar
