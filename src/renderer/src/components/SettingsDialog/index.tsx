import React from 'react'
import { Modal, Form, InputNumber, Radio, Button } from 'antd'
import { SunOutlined, MoonOutlined, DesktopOutlined } from '@ant-design/icons'

import './index.css'

interface Settings {
  theme: 'light' | 'dark' | 'system'
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
      className="rshell-modal"
      title="应用设置"
      open={open}
      onCancel={onClose}
      width={400}
      centered
      footer={(
        <div className="rshell-modal-footer">
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleSave}>保存</Button>
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
          <Radio.Group buttonStyle="solid" style={{ width: '100%', display: 'flex' }}>
            <Radio.Button value="light" style={{ flex: 1, textAlign: 'center' }}>
              <SunOutlined /> 浅色
            </Radio.Button>
            <Radio.Button value="dark" style={{ flex: 1, textAlign: 'center' }}>
              <MoonOutlined /> 深色
            </Radio.Button>
            <Radio.Button value="system" style={{ flex: 1, textAlign: 'center' }}>
              <DesktopOutlined /> 跟随系统
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
