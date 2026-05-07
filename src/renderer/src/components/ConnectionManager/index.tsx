import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Table, Button, Space, message, Empty, Tooltip } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { SSHConnectionConfig } from '../../../../shared/types'

import { useConnectionStore } from '../../store/useConnectionStore'

import './index.css'

interface ConnectionManagerProps {
  open: boolean
  onClose: () => void
  onConnect: (config: SSHConnectionConfig) => void
  onEdit: (config: SSHConnectionConfig | null) => void
}

const ConnectionManager: React.FC<ConnectionManagerProps> = ({
  open,
  onClose,
  onConnect,
  onEdit,
}) => {
  const { connections, loading, fetchConnections, removeConnection } = useConnectionStore()
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messageApi, contextHolder] = message.useMessage()
  const [modal, modalContextHolder] = Modal.useModal()

  useEffect(() => {
    if (open) {
      fetchConnections()
      setConnectingId(null)
    }

    const handleConnectError = () => {
      setConnectingId(null)
    }

    window.addEventListener('sessions:connect-error', handleConnectError)
    return () => {
      window.removeEventListener('sessions:connect-error', handleConnectError)
    }
  }, [open])

  useEffect(() => {
    if (connections.length > 0 && !selectedId) {
      setSelectedId(connections[0].id)
    }
  }, [connections, selectedId])

  const handleDelete = async (id: string) => {
    const conn = connections.find(c => c.id === id)
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
        } catch (err) {
          messageApi.error('删除失败')
        }
      },
    })
  }

  const selectedRecord = useMemo(() =>
    connections.find(c => c.id === selectedId),
  [connections, selectedId])

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: '主机',
      dataIndex: 'host',
      key: 'host',
    },
    {
      title: '端口',
      dataIndex: 'port',
      key: 'port',
      width: 80,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '认证方式',
      dataIndex: 'authType',
      key: 'authType',
      width: 100,
      render: (text: string) => (text === 'password' ? '密码' : '密钥'),
    },
  ]

  return (
    <Modal
      title="连接管理"
      open={open}
      onCancel={onClose}
      width={720}
      centered
      styles={{
        content: {
          padding: 0,
        },
        body: {
          height: '360px',
          overflow: 'hidden',
          padding: '0',
        },
      }}
      footer={(
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          backgroundColor: 'var(--bg-secondary)',
          padding: '10px 16px',
          borderTop: '1px solid var(--border-color)',
          borderBottomLeftRadius: '8px',
          borderBottomRightRadius: '8px',
        }}>
          <Space>
            <Button
              icon={<PlusOutlined />}
              onClick={() => onEdit(null)}
            >
              新建
            </Button>
            <Button
              danger
              disabled={!selectedId}
              icon={<DeleteOutlined />}
              onClick={() => selectedId && handleDelete(selectedId)}
            >
              删除
            </Button>
            <Button
              disabled={!selectedId}
              icon={<EditOutlined />}
              onClick={() => selectedRecord && onEdit(selectedRecord)}
            >
              编辑
            </Button>
            <Button
              type="primary"
              disabled={!selectedId}
              loading={connectingId !== null && connectingId === selectedId}
              icon={<PlayCircleOutlined />}
              onClick={() => {
                if (selectedRecord) {
                  setConnectingId(selectedRecord.id)
                  onConnect(selectedRecord)
                }
              }}
            >
              连接
            </Button>
          </Space>
        </div>
      )}
    >
      {contextHolder}
      {modalContextHolder}
      <Table
        columns={columns}
        dataSource={connections}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="small"
        scroll={{ y: 324 }}
        style={{ height: '360px' }}
        rowClassName={(record) => record.id === selectedId ? 'ant-table-row-selected' : ''}
        onRow={(record) => ({
          style: { cursor: 'pointer' },
          onClick: () => setSelectedId(record.id),
          onDoubleClick: () => {
            setSelectedId(record.id)
            setConnectingId(record.id)
            onConnect(record)
          }
        })}
        locale={{
          emptyText: (
            <Empty
              description="暂无连接"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ marginTop: '60px' }}
            />
          ),
        }}
      />
    </Modal>
  )
}

export default ConnectionManager
