import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Button, message, Spin, Empty } from 'antd'
import { SaveOutlined, CloseOutlined, WarningOutlined } from '@ant-design/icons'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { json } from '@codemirror/lang-json'
import { sql } from '@codemirror/lang-sql'
import { FileInfo } from '../../shared/types'

interface FileEditorProps {
  open: boolean
  sessionId: string
  filePath: string
  fileName: string
  onClose: () => void
  onSave?: (updatedFile: FileInfo) => void
}

const FileEditor: React.FC<FileEditorProps> = ({
  open,
  sessionId,
  filePath,
  fileName,
  onClose,
  onSave,
}) => {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  // 根据扩展名自动识别语言
  const extensions = useMemo(() => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    const langs: any[] = []
    if (ext === 'js' || ext === 'ts' || ext === 'jsx' || ext === 'tsx') langs.push(javascript({ jsx: true, typescript: ext.includes('t') }))
    else if (ext === 'py') langs.push(python())
    else if (ext === 'json') langs.push(json())
    else if (ext === 'html') langs.push(html())
    else if (ext === 'sql') langs.push(sql())
    return langs
  }, [fileName])

  useEffect(() => {
    if (open && filePath) {
      loadFileContent()
    }
  }, [open, filePath])

  const [error, setError] = useState<string | null>(null)

  // ... (inside loadFileContent)
  const loadFileContent = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.api.files.read(sessionId, filePath)
      setContent(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.api.files.write(sessionId, filePath, content)
      messageApi.success('保存成功')

      if (onSave) {
        try {
          const updated = await window.api.files.stat(sessionId, filePath)
          onSave(updated)
        } catch (e) {
          console.error('Failed to get stats', e)
        }
      }
    } catch (err) {
      messageApi.error(`保存失败: ${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width="80%"
      style={{ maxWidth: '960px' }}
      centered
      closable={false}
      footer={null}
      styles={{
        content: {
          padding: 0,
          borderRadius: '8px',
          overflow: 'hidden'
        },
        body: {
          height: '60vh',
          minHeight: '400px',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#fff'
        }
      }}
    >
      {contextHolder}
      {/* 顶部工具栏 */}
      <div style={{
        height: '44px',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
          <SaveOutlined style={{ color: 'var(--text-secondary)', fontSize: '16px' }} />
          <span style={{ 
            fontSize: '13px', 
            fontWeight: 500, 
            color: 'var(--text-primary)', 
            whiteSpace: 'nowrap', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis',
            fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
          }}>
            {filePath}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {!error && (
            <Button
              type="primary"
              size="small"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
              style={{ borderRadius: '4px' }}
            >
              保存
            </Button>
          )}
          <Button
            size="small"
            icon={<CloseOutlined />}
            onClick={onClose}
            style={{ borderRadius: '4px' }}
          >
            关闭
          </Button>
        </div>
      </div>

      {/* 编辑器主体 */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Spin spinning={loading} tip="加载中..." style={{ height: '100%', width: '100%' }} wrapperClassName="editor-spin-wrapper">
          {error ? (
            <div style={{ 
              height: '100%', 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center', 
              justifyContent: 'center',
              padding: '20px',
              textAlign: 'center'
            }}>
              <WarningOutlined style={{ fontSize: '48px', color: '#faad14', marginBottom: '16px' }} />
              <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>无法打开文件</div>
              <div style={{ color: 'var(--text-secondary)' }}>{error}</div>
            </div>
          ) : !loading && (
            <CodeMirror
              value={content}
              height="100%"
              theme="light"
              extensions={extensions}
              onChange={(value) => setContent(value)}
              onKeyDown={handleKeyDown}
              style={{
                height: '100%',
                fontSize: '13px',
              }}              basicSetup={{
                lineNumbers: true,
                highlightActiveLine: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                foldGutter: true,
              }}
            />
          )}
        </Spin>
      </div>

      {/* 底部状态栏 */}
      <div style={{
        height: '24px',
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#434343',
        color: '#d9d9d9',
        fontSize: '11px',
      }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <span>UTF-8</span>
          <span style={{ opacity: 0.9 }}>{fileName.split('.').pop()?.toUpperCase() || 'TEXT'}</span>
        </div>
        <div style={{ opacity: 0.8 }}>
          <span>RShell Editor</span>
        </div>
      </div>
    </Modal>
  )
}

export default FileEditor
