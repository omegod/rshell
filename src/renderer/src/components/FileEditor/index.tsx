import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Button, message, Spin, Empty } from 'antd'
import { SaveOutlined, CloseOutlined, WarningOutlined, FileTextOutlined } from '@ant-design/icons'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { json } from '@codemirror/lang-json'
import { sql } from '@codemirror/lang-sql'
import { FileInfo } from '../../../../shared/types'
import { useSessionStore } from '../../store/useSessionStore'

import './index.css'

interface FileEditorProps {
  open: boolean
  sessionId: string
  filePath: string
  fileName: string
  onClose: () => void
  onSave?: (updatedFile: FileInfo) => void
  colorTheme: 'light' | 'dark'
}

const FileEditor: React.FC<FileEditorProps> = ({
  open,
  sessionId,
  filePath,
  fileName,
  onClose,
  onSave,
  colorTheme,
}) => {
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const [modal, modalContextHolder] = Modal.useModal()
  const upsertFile = useSessionStore((s) => s.upsertFile)

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
    if (!open || !filePath) return
    let cancelled = false

    setLoading(true)
    setError(null)
    window.api.files.read(sessionId, filePath)
      .then((data) => {
        if (cancelled) return
        setContent(data)
        setSavedContent(data)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '未知错误')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, sessionId, filePath])

  const [error, setError] = useState<string | null>(null)

  const dirty = content !== savedContent

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.api.files.write(sessionId, filePath, content)
      setSavedContent(content)
      messageApi.success('保存成功')

      try {
        const updated = await window.api.files.stat(sessionId, filePath)
        upsertFile(sessionId, updated)
        onSave?.(updated)
      } catch (e) {
        console.error('Failed to get stats', e)
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

  const requestClose = () => {
    if (!dirty) {
      onClose()
      return
    }
    modal.confirm({
      title: '放弃未保存的修改？',
      content: '关闭后，本次修改将无法恢复。',
      okText: '放弃修改',
      okType: 'danger',
      cancelText: '继续编辑',
      centered: true,
      onOk: onClose,
    })
  }

  return (
    <Modal
      className="rshell-modal rshell-editor-modal"
      open={open}
      onCancel={requestClose}
      width="80%"
      style={{ maxWidth: '960px' }}
      centered
      closable={false}
      footer={null}
      styles={{
        body: {
          height: '60vh',
          minHeight: '400px',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-primary)'
        }
      }}
    >
      {contextHolder}
      {modalContextHolder}
      <div className="editor-header">
        <div className="editor-header-title">
          <FileTextOutlined className="editor-header-icon" />
          <span className="editor-header-path">
            {filePath}{dirty ? ' •' : ''}
          </span>
        </div>
        <div className="editor-header-actions">
          {!error && (
            <Button
              type="primary"
              size="small"
              icon={<SaveOutlined />}
              loading={saving}
              disabled={!dirty}
              onClick={handleSave}
            >
              保存
            </Button>
          )}
          <Button
            size="small"
            icon={<CloseOutlined />}
            onClick={requestClose}
          >
            关闭
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Spin spinning={loading} tip="加载中..." style={{ height: '100%', width: '100%' }} wrapperClassName="editor-spin-wrapper">
          {error ? (
            <div className="editor-error-state">
              <WarningOutlined className="editor-error-icon" />
              <div className="editor-error-title">无法打开文件</div>
              <div style={{ color: 'var(--text-secondary)' }}>{error}</div>
            </div>
          ) : !loading && (
            <CodeMirror
              value={content}
              height="100%"
              theme={colorTheme}
              extensions={extensions}
              onChange={(value) => setContent(value)}
              onKeyDown={handleKeyDown}
              style={{
                height: '100%',
                fontSize: '13px',
              }}
              basicSetup={{
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

      <div className="editor-statusbar">
        <div className="status-group">
          <span>UTF-8</span>
          <span>{fileName.split('.').pop()?.toUpperCase() || 'TEXT'}</span>
        </div>
        <div className="status-hint">
          <span>RShell Editor</span>
        </div>
      </div>
    </Modal>
  )
}

export default FileEditor
