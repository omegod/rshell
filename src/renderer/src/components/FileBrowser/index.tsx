import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Tree, Button, Space, Modal, AutoComplete, message, Spin, Empty, Tooltip, Dropdown,
  Select, Form, Input
} from 'antd'
import {
  FolderOutlined,
  FolderOpenOutlined,
  FileOutlined,
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  ReloadOutlined,
  RollbackOutlined,
  EditOutlined,
  FileTextOutlined,
  MoreOutlined,
  PlusOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { FileInfo } from '../../../../shared/types'
import type { DataNode, TreeProps } from 'antd/es/tree'
import { useSessionStore } from '../../store/useSessionStore'
import { useFileActions } from '../../hooks/useFileActions'
import { TransferPanel } from './TransferPanel'

import './index.css'

interface FileBrowserProps {
  sessionId: string
  currentPath: string
  onPathChange: (path: string) => void
  onEditFile: (file: FileInfo) => void
}

const PARENT_KEY = '__parent__'
const ROOT_KEY = '__root__'

export default function FileBrowser({
  sessionId,
  currentPath,
  onPathChange,
  onEditFile,
}: FileBrowserProps) {
  const {
    sessions,
    setPath,
    setFiles,
    setLoadedKeys,
    setExpandedKeys: setStoreExpandedKeys,
    updateTransfer,
    removeFile,
    removeChildFile,
  } = useSessionStore()

  const {
    loadFiles,
    loadDirChildren,
    addFileItem,
    addChildFileItem,
    handleUpload,
    handleDownload,
    handleDelete,
  } = useFileActions(sessionId)

  const sessionState = sessions[sessionId] || {
    currentPath: '~',
    files: [],
    childrenMap: {},
    loadedKeys: [],
    expandedKeys: [ROOT_KEY],
  }

  const files = sessionState.files
  const childrenMap = sessionState.childrenMap
  const loadedKeys = sessionState.loadedKeys
  const expandedKeys = sessionState.expandedKeys

  const [loading, setLoading] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
  const [pathInput, setPathInput] = useState(currentPath)
  const [pathOptions, setPathOptions] = useState<{ value: string; label: React.ReactNode }[]>([])
  const [messageApi, contextHolder] = message.useMessage()
  const [modal, modalContextHolder] = Modal.useModal()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectingRef = useRef(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  const [transferPanelCollapsed, setTransferPanelCollapsed] = useState(false)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createPath, setCreatePath] = useState('')
  const [createType, setCreateType] = useState<'folder' | 'file'>('folder')
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)

  const dirName = currentPath === '/' ? '/' : currentPath.split('/').filter(Boolean).pop() || '/'
  const isRoot = currentPath === '/'

  useEffect(() => {
    setPathInput(currentPath)
    setStoreExpandedKeys(sessionId, [ROOT_KEY])
    setSelectedKeys([])
    setPath(sessionId, currentPath)
  }, [currentPath, sessionId])

  useEffect(() => {
    const fetchFiles = async () => {
      setLoading(true)
      await loadFiles(currentPath)
      setLoading(false)
    }
    fetchFiles()
  }, [currentPath, loadFiles])

  useEffect(() => {
    const handleProgress = (e: Event) => {
      const { id, percent, speed } = (e as CustomEvent).detail
      updateTransfer(id, { progress: percent, speed: speed || 0 })
    }
    window.addEventListener('files:progress', handleProgress)
    return () => window.removeEventListener('files:progress', handleProgress)
  }, [updateTransfer])

  const fetchPathSuggestions = useCallback(async (value: string) => {
    if (!value) {
      setPathOptions([])
      return
    }

    const lastSlash = value.lastIndexOf('/')
    const prefix = value.slice(lastSlash + 1)
    const parentDir = lastSlash === 0 ? '/' : value.slice(0, lastSlash)

    try {
      const list = await window.api.files.list(sessionId, parentDir)
      const options = list
        .filter((f: FileInfo) => f.isDirectory && f.name.startsWith(prefix))
        .map((f: FileInfo) => {
          const basePath = parentDir === '/' ? '' : parentDir
          const fullPath = `${basePath}/${f.name}`
          return {
            value: f.isDirectory ? `${fullPath}/` : fullPath,
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {f.isDirectory ? (
                  <FolderOutlined style={{ color: '#d4a853' }} />
                ) : (
                  <FileOutlined style={{ color: '#8e8e93' }} />
                )}
                <span>{f.name}</span>
              </span>
            ),
          }
        })
      setPathOptions(options)
    } catch {
      setPathOptions([])
    }
  }, [sessionId])

  const submitPath = useCallback(async (path: string) => {
    const trimmed = path.trim()
    if (!trimmed || trimmed === currentPath) return
    try {
      await window.api.files.list(sessionId, trimmed)
      onPathChange(trimmed)
    } catch {
      messageApi.error('路径不存在')
      setPathInput(currentPath)
    }
  }, [sessionId, currentPath, onPathChange, messageApi])

  const handlePathInputChange = useCallback((value: string) => {
    setPathInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchPathSuggestions(value), 300)
  }, [fetchPathSuggestions])

  const handlePathSelect = useCallback((value: string) => {
    selectingRef.current = true
    setPathInput(value)
    setPathOptions([])
    submitPath(value)
    setTimeout(() => {
      selectingRef.current = false
    }, 200)
  }, [submitPath])

  const handlePathSubmit = () => {
    if (selectingRef.current) return
    submitPath(pathInput)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      setTimeout(() => {
        if (!selectingRef.current) {
          handlePathSubmit()
        }
      }, 50)
    }
  }

  const handleCancelTransfer = async (id: string) => {
    await window.api.files.cancel(id)
    updateTransfer(id, { speed: 0, status: 'error' })
  }

  const handleRename = (file: FileInfo) => {
    setEditingKey(file.path)
    setEditingValue(file.name)
  }

  const handleRenameSubmit = async () => {
    if (!editingKey || !editingValue.trim()) {
      setEditingKey(null)
      return
    }
    const file = files.find((f) => f.path === editingKey)
      || Object.values(childrenMap).flat().find((f) => f.path === editingKey)
    if (!file) { setEditingKey(null); return }
    if (editingValue === file.name) { setEditingKey(null); return }

    const lastSlash = file.path.lastIndexOf('/')
    const parentDir = lastSlash === 0 ? '/' : file.path.slice(0, lastSlash)
    const newPath = parentDir === '/' ? `/${editingValue}` : `${parentDir}/${editingValue}`

    try {
      await window.api.files.rename(sessionId, file.path, newPath)
      messageApi.success('重命名成功')
      if (parentDir === currentPath) {
        removeFile(sessionId, file.path)
        addFileItem(newPath)
      } else {
        if (childrenMap[parentDir]) {
          removeChildFile(sessionId, parentDir, file.path)
          addChildFileItem(newPath, parentDir)
        }
        setLoadedKeys(sessionId, (prev) => prev.filter(k => k !== parentDir))
      }
    } catch (err) {
      messageApi.error(`重命名失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
    setEditingKey(null)
  }

  const handleCreateConfirm = async () => {
    if (!createName.trim()) {
      messageApi.warning('请输入名称')
      return
    }
    setCreating(true)
    try {
      const newPath = createPath === '/' ? `/${createName}` : `${createPath}/${createName}`
      if (createType === 'folder') {
        await window.api.files.mkdir(sessionId, newPath)
      } else {
        await window.api.sessions.execute(sessionId, `touch "${newPath}"`)
      }
      messageApi.success('创建成功')
      setShowCreateModal(false)

      if (createPath === currentPath) {
        addFileItem(newPath)
      } else {
        if (childrenMap[createPath]) {
          addChildFileItem(newPath, createPath)
        }
        setLoadedKeys(sessionId, (prev) => prev.filter(k => k !== createPath))
      }
    } catch (err) {
      messageApi.error(`创建失败: ${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setCreating(false)
    }
  }

  const contextMenuItems = (file: FileInfo) => {
    const items: any[] = []
    if (file.isDirectory) {
      items.push({ key: 'create', label: '新建', icon: <PlusOutlined />, onClick: () => {
        setCreatePath(file.path); setCreateType('folder'); setCreateName(''); setShowCreateModal(true);
      }})
      items.push({ key: 'upload-to', label: '上传', icon: <UploadOutlined />, onClick: () => handleUpload(file.path) })
      items.push({ type: 'divider' as const })
    }
    items.push({ key: 'rename', label: '重命名', icon: <EditOutlined />, onClick: () => handleRename(file) })
    if (!file.isDirectory) {
      items.push({ key: 'edit', label: '编辑', icon: <FileTextOutlined />, onClick: () => onEditFile(file) })
      items.push({ key: 'download', label: '下载', icon: <DownloadOutlined />, onClick: () => handleDownload(file) })
    }
    items.push({ type: 'divider' as const })
    items.push({ key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => {
      modal.confirm({
        title: '删除确认',
        content: `确定要删除 "${file.name}" 吗？`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => handleDelete(file)
      })
    }})
    return items
  }

  const buildFileNode = (file: FileInfo): DataNode => {
    const isDir = file.isDirectory
    const children = isDir ? childrenMap[file.path] : undefined
    const isEditing = editingKey === file.path

    if (isEditing) {
      return {
        key: file.path,
        title: (
          <div className="file-tree-item file-tree-item-editing">
            <span className="file-icon">
              {isDir ? <FolderOutlined style={{ color: '#d4a853' }} /> : <FileOutlined style={{ color: '#8e8e93' }} />}
            </span>
            <Input
              size="small"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onPressEnter={handleRenameSubmit}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => { if (e.key === 'Escape') setEditingKey(null) }}
              autoFocus
              className="file-rename-input"
            />
          </div>
        ),
        isLeaf: !isDir,
      }
    }

    return {
      key: file.path,
      title: (
        <Dropdown menu={{ items: contextMenuItems(file) }} trigger={['contextMenu']}>
          <div className="file-tree-item">
            <span className="file-icon">
              {isDir
                ? (expandedKeys.includes(file.path)
                    ? <FolderOpenOutlined style={{ color: '#d4a853' }} />
                    : <FolderOutlined style={{ color: '#d4a853' }} />)
                : <FileOutlined style={{ color: '#8e8e93' }} />}
            </span>
            <span className="file-name">{file.name}</span>
            <span className="file-meta">
              {!isDir && <span className="file-size">{formatSize(file.size)}</span>}
            </span>
            <Dropdown menu={{ items: contextMenuItems(file) }} trigger={['click']}>
              <Button type="text" size="small" icon={<MoreOutlined />} className="file-action-btn" onClick={(e) => e.stopPropagation()} />
            </Dropdown>
          </div>
        </Dropdown>
      ),
      isLeaf: !isDir,
      children: isDir ? (children ? children.map(buildFileNode) : undefined) : undefined,
    }
  }

  const treeData = useMemo((): DataNode[] => {
    const rootChildren: DataNode[] = files.map(buildFileNode)
    const rootMenuItems: any[] = [
      { key: 'refresh', label: '刷新', icon: <ReloadOutlined />, onClick: () => { loadFiles(currentPath) } },
      { type: 'divider' as const },
      { key: 'create', label: '新建', icon: <PlusOutlined />, onClick: () => {
        setCreatePath(currentPath); setCreateType('folder'); setCreateName(''); setShowCreateModal(true);
      }},
    ]

    return [{
      key: ROOT_KEY,
      title: (
        <Dropdown menu={{ items: rootMenuItems }} trigger={['contextMenu']}>
          <div className="file-tree-root-label">
            <FolderOutlined style={{ color: '#d4a853', marginRight: 6 }} />
            <span className="file-tree-root-name">{dirName}</span>
            <Dropdown menu={{ items: rootMenuItems }} trigger={['click']}>
              <Button type="text" size="small" icon={<MoreOutlined />} className="file-action-btn" onClick={(e) => e.stopPropagation()} />
            </Dropdown>
          </div>
        </Dropdown>
      ),
      children: rootChildren,
    }]
  }, [files, childrenMap, currentPath, dirName, expandedKeys, editingKey, editingValue])

  const handleExpand: TreeProps['onExpand'] = (expandedKeysValue) => {
    setStoreExpandedKeys(sessionId, expandedKeysValue as string[])
  }

  const handleLoadData: TreeProps['loadData'] = async (node) => {
    const key = node.key as string
    if (key === PARENT_KEY || key === ROOT_KEY) return
    const file = files.find((f) => f.path === key)
      || Object.values(childrenMap).flat().find((f) => f.path === key)
    if (file?.isDirectory) {
      await loadDirChildren(file.path)
      setLoadedKeys(sessionId, (prev) => [...prev, key])
    }
  }

  const handleDoubleClick: TreeProps['onDoubleClick'] = (_info, node) => {
    const key = node.key as string
    if (key === ROOT_KEY || key === PARENT_KEY) {
      const parts = currentPath.split('/').filter(Boolean)
      parts.pop()
      onPathChange(parts.length === 0 ? '/' : `/${parts.join('/')}`)
      return
    }
    const file = files.find((f) => f.path === key)
      || Object.values(childrenMap).flat().find((f) => f.path === key)
    if (file?.isDirectory) onPathChange(file.path)
    else if (file) handleDownload(file)
  }

  return (
    <div className="file-browser">
      {contextHolder}
      {modalContextHolder}
      <div className="file-browser-header">
        <div className="file-browser-title-row">
          <div className="file-browser-title">文件管理</div>
          <div className="file-browser-toolbar">
            <Tooltip title="返回上级">
              <Button size="small" type="text" icon={<RollbackOutlined />} onClick={() => {
                const parts = currentPath.split('/').filter(Boolean)
                parts.pop()
                onPathChange(parts.length === 0 ? '/' : `/${parts.join('/')}`)
              }} disabled={isRoot} />
            </Tooltip>
            <Tooltip title="刷新">
              <Button size="small" type="text" icon={<ReloadOutlined />} onClick={async () => {
                await loadFiles(currentPath)
                for (const key of expandedKeys) {
                  if (key !== ROOT_KEY && key !== currentPath && childrenMap[key]) {
                    loadDirChildren(key)
                  }
                }
              }} />
            </Tooltip>
            <Tooltip title="上传">
              <Button size="small" type="text" icon={<UploadOutlined />} onClick={() => handleUpload()} />
            </Tooltip>
            <Tooltip title="新建">
              <Button size="small" type="text" icon={<PlusOutlined />} onClick={() => {
                setCreatePath(currentPath); setCreateType('folder'); setCreateName(''); setShowCreateModal(true);
              }} />
            </Tooltip>
          </div>
        </div>
        <div className="file-browser-path-input">
          <AutoComplete
            size="small"
            value={pathInput}
            options={pathOptions}
            onChange={handlePathInputChange}
            onSelect={handlePathSelect}
            onBlur={() => submitPath(pathInput)}
            onKeyDown={handleKeyDown}
            placeholder="输入路径并回车"
          />
        </div>
      </div>
      <div className="file-browser-content">
        <Spin spinning={loading} size="small">
          {files.length === 0 && !loading ? (
            <div style={{ padding: '40px 0' }}>
              <Empty description="空目录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          ) : (
            <Tree
              treeData={treeData}
              expandedKeys={expandedKeys}
              selectedKeys={selectedKeys}
              loadedKeys={loadedKeys}
              onExpand={handleExpand}
              onSelect={(keys) => setSelectedKeys(keys)}
              onDoubleClick={handleDoubleClick}
              loadData={handleLoadData}
              showLine={false}
              showIcon={false}
              blockNode
              switcherIcon={({ expanded }) =>
                expanded
                  ? <DownOutlined style={{ fontSize: 10, color: '#8c8c8c' }} />
                  : <RightOutlined style={{ fontSize: 10, color: '#8c8c8c' }} />
              }
            />
          )}
        </Spin>
      </div>

      <TransferPanel
        collapsed={transferPanelCollapsed}
        onToggle={() => setTransferPanelCollapsed(!transferPanelCollapsed)}
        onCancel={handleCancelTransfer}
      />

      <Modal
        title="新建"
        open={showCreateModal}
        onCancel={() => setShowCreateModal(false)}
        width={360}
        centered
        destroyOnClose
        styles={{
          content: {
            padding: 0,
            borderRadius: '8px',
            overflow: 'hidden',
          },
          body: {
            padding: '20px 24px',
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
          }}>
            <Space>
              <Button onClick={() => setShowCreateModal(false)}>
                取消
              </Button>
              <Button type="primary" onClick={handleCreateConfirm} loading={creating}>
                创建
              </Button>
            </Space>
          </div>
        )}
      >
        <Form layout="vertical">
          <Form.Item label="类型">
            <Select
              value={createType}
              onChange={(value: 'folder' | 'file') => setCreateType(value)}
              options={[{ value: 'folder', label: '文件夹' }, { value: 'file', label: '文件' }]}
            />
          </Form.Item>
          <Form.Item label="名称" required>
            <Input
              placeholder={createType === 'folder' ? '请输入文件夹名称' : '请输入文件名称'}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onPressEnter={handleCreateConfirm}
              autoFocus
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
