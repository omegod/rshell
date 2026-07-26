import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Button, message, Spin, Empty, Input } from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  ExclamationCircleOutlined,
  CloudServerOutlined,
  RightOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { SSHConnectionConfig } from '../../../../shared/types'

import { useConnectionStore } from '../../store/useConnectionStore'

import './index.css'

interface ConnectionManagerProps {
  open: boolean
  onClose: () => void
  onConnect: (config: SSHConnectionConfig) => Promise<void>
  onEdit: (config: SSHConnectionConfig | null) => void
  embedded?: boolean
}

const ConnectionManager: React.FC<ConnectionManagerProps> = ({
  open,
  onClose,
  onConnect,
  onEdit,
  embedded = false,
}) => {
  const { connections, loading, fetchConnections, removeConnection } = useConnectionStore()
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [messageApi, contextHolder] = message.useMessage()
  const [modal, modalContextHolder] = Modal.useModal()

  useEffect(() => {
    if (open || embedded) {
      fetchConnections()
      setConnectingId(null)
      setSearchText('')
    }
  }, [open, embedded])

  useEffect(() => {
    if (connections.length > 0 && !selectedId) {
      setSelectedId(connections[0].id)
    }
  }, [connections, selectedId])

  const connect = async (config: SSHConnectionConfig) => {
    setConnectingId(config.id)
    try {
      await onConnect(config)
    } finally {
      setConnectingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    const conn = connections.find((c) => c.id === id)
    if (!conn) return

    modal.confirm({
      title: '删除确认',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除连接 "${conn.name}" 吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        try {
          await window.api.connections.delete(id)
          messageApi.success('已删除')
          removeConnection(id)
          setSelectedId(null)
        } catch {
          messageApi.error('删除失败')
        }
      },
    })
  }

  const selectedRecord = useMemo(
    () => connections.find((c) => c.id === selectedId),
    [connections, selectedId]
  )

  const filteredConnections = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()
    if (!keyword) return connections
    return connections.filter((conn) =>
      [conn.name, conn.host, conn.username].some((field) =>
        field?.toLowerCase().includes(keyword)
      )
    )
  }, [connections, searchText])

  const searchBar = !loading && connections.length > 0 && (
    <Input
      className="connection-search"
      allowClear
      prefix={<SearchOutlined />}
      placeholder="搜索名称、主机或用户名"
      value={searchText}
      onChange={(e) => setSearchText(e.target.value)}
    />
  )

  const listContent = (
    <div className="connection-list-panel">
      {loading ? (
        <div className="connection-list-state">
          <Spin size="small" />
        </div>
      ) : connections.length === 0 ? (
        <div className="connection-list-state">
          <Empty
            description="暂无连接，点击「新建连接」开始"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </div>
      ) : filteredConnections.length === 0 ? (
        <div className="connection-list-state">
          <Empty description="无匹配的连接" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        filteredConnections.map((conn) => (
          <div
            key={conn.id}
            className={`connection-row ${conn.id === selectedId ? 'selected' : ''}`}
            onClick={() => setSelectedId(conn.id)}
            onDoubleClick={() => connect(conn)}
          >
            <div className="connection-row-icon">
              <CloudServerOutlined />
            </div>
            <div className="connection-row-main">
              <div className="connection-row-name">{conn.name}</div>
              <div className="connection-row-meta">
                {conn.username}@{conn.host}:{conn.port} · {conn.authType === 'password' ? '密码认证' : '密钥认证'}
              </div>
            </div>
            <div className="connection-row-trailing">
              {connectingId === conn.id ? (
                <Spin size="small" />
              ) : (
                <RightOutlined className="connection-row-chevron" />
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )

  const actionButtons = (showNew: boolean) => (
    <>
      {showNew && (
        <Button icon={<PlusOutlined />} onClick={() => onEdit(null)}>
          新建
        </Button>
      )}
      <Button
        icon={<EditOutlined />}
        disabled={!selectedId}
        onClick={() => selectedRecord && onEdit(selectedRecord)}
      >
        编辑
      </Button>
      <Button
        danger
        icon={<DeleteOutlined />}
        disabled={!selectedId}
        onClick={() => selectedId && handleDelete(selectedId)}
      >
        删除
      </Button>
      <Button
        type="primary"
        icon={<PlayCircleOutlined />}
        disabled={!selectedId}
        loading={connectingId === selectedId}
        onClick={() => selectedRecord && connect(selectedRecord)}
      >
        连接
      </Button>
    </>
  )

  if (embedded) {
    return (
      <main className="connection-home">
        {contextHolder}
        {modalContextHolder}
        <div className="connection-home-inner">
          <header className="connection-home-header">
            <div>
              <h1>连接</h1>
              <p>选择一个远程主机开始会话，双击即可连接</p>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => onEdit(null)}>
              新建连接
            </Button>
          </header>
          {searchBar}
          {listContent}
          {connections.length > 0 && (
            <div className="connection-actions">{actionButtons(false)}</div>
          )}
        </div>
      </main>
    )
  }

  return (
    <Modal
      className="rshell-modal"
      title="连接"
      open={open}
      onCancel={onClose}
      width={520}
      centered
      footer={<div className="rshell-modal-footer">{actionButtons(true)}</div>}
    >
      {contextHolder}
      {modalContextHolder}
      {searchBar}
      <div className="connection-modal-list">{listContent}</div>
    </Modal>
  )
}

export default ConnectionManager
