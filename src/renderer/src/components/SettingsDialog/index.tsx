import React from 'react'
import { Modal, Form, Select, InputNumber, Radio, Space, Button } from 'antd'
import { DesktopOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons'

import './index.css'

interface Settings {
  theme: 'light' | 'dark'
  terminalFontSize: number
}

interface SettingsDialogProps {
  open: boolean
  settings: Settings
  onClose: () => void
  onSave: (settings: Settings) => void
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  settings,
  onClose,
  onSave,
}) => {
  const [form] = Form.useForm()

  React.useEffect(() => {
    if (open) {
      form.setFieldsValue(settings)
    }
  }, [open, settings, form])

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      onSave(values)
      onClose()
    } catch (err) {
      // Validation error
    }
  }

  return (
    <Modal
      title="应用设置"
      open={open}
      onCancel={onClose}
      width={400}
      centered
      styles={{
        content: {
          padding: 0,
        },
        body: {
          padding: '24px',
        }
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
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" onClick={handleSave}>保存</Button>
          </Space>
        </div>
      )}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={settings}
      >
        <Form.Item
          name="theme"
          label="外观主题"
        >
          <Radio.Group buttonStyle="solid" style={{ width: '100%' }}>
            <Radio.Button value="light" style={{ width: '50%', textAlign: 'center' }}>
              <SunOutlined /> 浅色
            </Radio.Button>
            <Radio.Button value="dark" style={{ width: '50%', textAlign: 'center' }}>
              <MoonOutlined /> 深色
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="terminalFontSize"
          label="终端字体大小"
        >
          <InputNumber
            min={10}
            max={32}
            style={{ width: '100%' }}
            addonAfter="px"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default SettingsDialog
