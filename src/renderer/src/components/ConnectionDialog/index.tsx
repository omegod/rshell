import React, { useState, useEffect } from 'react'
import { Modal, Form, Input, InputNumber, Select, Button, message } from 'antd'
import { SSHConnectionConfig } from '../../../../shared/types'
import { KeyOutlined, LockOutlined, UserOutlined } from '@ant-design/icons'

import './index.css'

interface ConnectionDialogProps {
  open: boolean
  editingConfig: SSHConnectionConfig | null
  onClose: () => void
  onConnect: (config: SSHConnectionConfig) => Promise<void>
  onSave: (config: SSHConnectionConfig) => Promise<SSHConnectionConfig>
}

const ConnectionDialog: React.FC<ConnectionDialogProps> = ({
  open,
  editingConfig,
  onClose,
  onConnect,
  onSave,
}) => {
  const [form] = Form.useForm()
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    if (open) {
      if (editingConfig) {
        form.setFieldsValue(editingConfig)
      } else {
        form.resetFields()
        form.setFieldsValue({
          port: 22,
          authType: 'password',
        })
      }
    }
  }, [open, editingConfig, form])

  const handleTest = async () => {
    try {
      const values = await form.validateFields()
      setTesting(true)

      const testConfig = {
        host: values.host,
        port: values.port,
        username: values.username,
        authType: values.authType,
        password: values.password,
        privateKeyPath: values.privateKeyPath,
        passphrase: values.passphrase,
      }

      const result = await window.api.connections.test(testConfig)

      if (result.success) {
        messageApi.success(`连接成功 (${result.latency}ms)`)
      } else {
        messageApi.error(result.message)
      }
    } catch (err) {
      if (err instanceof Error) {
        messageApi.error(err.message)
      }
    } finally {
      setTesting(false)
    }
  }

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const values = await form.validateFields()

      const config: SSHConnectionConfig = {
        id: editingConfig?.id || '',
        name: values.name,
        host: values.host,
        port: values.port,
        username: values.username,
        authType: values.authType,
        password: values.password,
        privateKeyPath: values.privateKeyPath,
        passphrase: values.passphrase,
        createdAt: editingConfig?.createdAt || '',
        updatedAt: editingConfig?.updatedAt || '',
      }

      const saved = await onSave(config)
      await onConnect(saved)
    } catch (err) {
      // Connection errors are reported by the app-level handler.
    } finally {
      setConnecting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const values = await form.validateFields()

      const config: SSHConnectionConfig = {
        id: editingConfig?.id || '',
        name: values.name,
        host: values.host,
        port: values.port,
        username: values.username,
        authType: values.authType,
        password: values.password,
        privateKeyPath: values.privateKeyPath,
        passphrase: values.passphrase,
        createdAt: editingConfig?.createdAt || '',
        updatedAt: editingConfig?.updatedAt || '',
      }

      await onSave(config)
      messageApi.success('保存成功')
      onClose()
    } catch (err) {
      if (err instanceof Error) {
        messageApi.error(err.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handlePickKey = async () => {
    const keyPath = await window.api.app.pickFile({
      title: '选择私钥文件',
      filters: [
        { name: '所有文件', extensions: ['*'] },
        { name: 'PEM 文件', extensions: ['pem'] },
        { name: 'SSH 密钥', extensions: ['key', 'ppk'] },
      ],
    })

    if (keyPath) {
      form.setFieldValue('privateKeyPath', keyPath)
    }
  }

  return (
    <Modal
      className="rshell-modal"
      title={editingConfig ? '编辑连接' : '新建连接'}
      open={open}
      onCancel={onClose}
      width={520}
      centered
      footer={(
        <div className="rshell-modal-footer">
          <Button key="cancel" onClick={onClose}>
            取消
          </Button>
          <Button key="test" onClick={handleTest} loading={testing}>
            测试连接
          </Button>
          <Button key="save" onClick={handleSave} loading={saving}>
            保存
          </Button>
          <Button key="connect" type="primary" onClick={handleConnect} loading={connecting}>
            连接
          </Button>
        </div>
      )}
    >
      {contextHolder}
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          port: 22,
          authType: 'password',
        }}
      >
        <Form.Item
          name="name"
          label="连接名称"
          rules={[{ required: true, message: '请输入连接名称' }]}
        >
          <Input placeholder="我的服务器" />
        </Form.Item>

        <div className="form-row">
          <Form.Item
            name="host"
            label="主机地址"
            rules={[{ required: true, message: '请输入主机地址' }]}
            className="form-row-grow"
          >
            <Input placeholder="192.168.1.100 或 example.com" />
          </Form.Item>

          <Form.Item
            name="port"
            label="端口"
            rules={[{ required: true, message: '请输入端口' }]}
            className="form-row-port"
          >
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>
        </div>

        <Form.Item
          name="username"
          label="用户名"
          rules={[{ required: true, message: '请输入用户名' }]}
        >
          <Input placeholder="root" prefix={<UserOutlined />} />
        </Form.Item>

        <Form.Item
          name="authType"
          label="认证方式"
          rules={[{ required: true }]}
        >
          <Select
            options={[
              { value: 'password', label: '密码' },
              { value: 'privateKey', label: '私钥' },
            ]}
          />
        </Form.Item>

        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.authType !== cur.authType}>
          {({ getFieldValue }) =>
            getFieldValue('authType') === 'password' ? (
              <Form.Item
                name="password"
                label="密码"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password placeholder="输入密码" prefix={<LockOutlined />} />
              </Form.Item>
            ) : (
              <>
                <Form.Item
                  name="privateKeyPath"
                  label="私钥路径"
                  rules={[{ required: true, message: '请选择私钥文件' }]}
                >
                  <Input
                    placeholder="/Users/username/.ssh/id_rsa"
                    addonAfter={
                      <Button type="link" size="small" onClick={handlePickKey}>
                        浏览
                      </Button>
                    }
                    prefix={<KeyOutlined />}
                  />
                </Form.Item>

                <Form.Item name="passphrase" label="私钥密码（可选）">
                  <Input.Password placeholder="如果私钥有加密请输入密码" />
                </Form.Item>
              </>
            )
          }
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default ConnectionDialog
