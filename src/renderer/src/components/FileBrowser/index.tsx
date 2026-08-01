import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Tree, Button, Modal, AutoComplete, message, Spin, Empty, Tooltip, Dropdown,
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
  CopyOutlined,
  ScissorOutlined,
  SnippetsOutlined,
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

interface ClipboardItem {
  type: 'copy' | 'cut'
  path: string
  name: string
  sessionId: string
}

export default function FileBrowser({
  sessionId,
  currentPath,
  onPathChange,
  onEditFile,
}: FileBrowserProps) {
  const sessionState = useSessionStore((state) => state.sessions[sessionId])
  const setPath = useSessionStore((state) => state.setPath)
  const setLoadedKeys = useSessionStore((state) => state.setLoadedKeys)
  const setStoreExpandedKeys = useSessionStore((state) => state.setExpandedKeys)
  const updateTransfer = useSessionStore((state) => state.updateTransfer)
  const removeFile = useSessionStore((state) => state.removeFile)
  const removeChildFile = useSessionStore((state) => state.removeChildFile)

  const {
    loadFiles,
    loadDirChildren,
    addFileItem,
    addChildFileItem,
    handleUpload,
    handleDownload,
    handleDelete,
  } = useFileActions(sessionId)

  const currentSessionState = sessionState || {
    currentPath: '~',
    files: [],
    childrenMap: {},
    loadedKeys: [],
    expandedKeys: [ROOT_KEY],
  }

  const files = currentSessionState.files
  const childrenMap = currentSessionState.childrenMap
  const loadedKeys = currentSessionState.loadedKeys
  const expandedKeys = currentSessionState.expandedKeys

  const [loading, setLoading] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
  const [pathInput, setPathInput] = useState(currentPath)
  const [pathOptions, setPathOptions] = useState<{ value: string; label: React.ReactNode }[]>([])
  const [messageApi, contextHolder] = message.useMessage()
  const [modal, modalContextHolder] = Modal.useModal()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggestionRequestRef = useRef(0)
  const selectingRef = useRef(false)
  const lastSuccessfulPathRef = useRef(currentPath)
  const onPathChangeRef = useRef(onPathChange)
  onPathChangeRef.current = onPathChange
  const contentRef = useRef<HTMLDivElement>(null)
  const [treeHeight, setTreeHeight] = useState(0)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  const [transferPanelCollapsed, setTransferPanelCollapsed] = useState(true)

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
      const success = await loadFiles(currentPath)
      if (success) {
        lastSuccessfulPathRef.current = currentPath
      } else if (lastSuccessfulPathRef.current !== currentPath) {
        onPathChangeRef.current(lastSuccessfulPathRef.current)
      }
      setLoading(false)
    }
    fetchFiles()
  }, [currentPath, loadFiles])

  useEffect(() => {
    const element = contentRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setTreeHeight(Math.max(0, Math.floor(entry.contentRect.height - 8)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  const fetchPathSuggestions = useCallback(async (value: string) => {
    const requestId = ++suggestionRequestRef.current
    if (!value) {
      setPathOptions([])
      return
    }

    const lastSlash = value.lastIndexOf('/')
    if (lastSlash < 0) {
      setPathOptions([])
      return
    }
    const prefix = value.slice(lastSlash + 1)
    const parentDir = lastSlash === 0 ? '/' : value.slice(0, lastSlash)

    try {
      const list = await window.api.files.list(sessionId, parentDir)
      if (requestId !== suggestionRequestRef.current) return
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
                  <FolderOutlined style={{ color: 'var(--folder)' }} />
                ) : (
                  <FileOutlined style={{ color: 'var(--text-tertiary)' }} />
                )}
                <span>{f.name}</span>
              </span>
            ),
          }
        })
      setPathOptions(options)
    } catch {
      if (requestId === suggestionRequestRef.current) setPathOptions([])
    }
  }, [sessionId])

  const submitPath = useCallback((path: string) => {
    const trimmed = path.trim()
    if (!trimmed || trimmed === currentPath) return
    onPathChange(trimmed)
  }, [currentPath, onPathChange])

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
    updateTransfer(id, { speed: 0, status: 'error' })
    await window.api.files.cancel(id)
  }

  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null)

  const canPaste = clipboard !== null && clipboard.sessionId === sessionId

  const handleCopy = (file: FileInfo) => {
    setClipboard({ type: 'copy', path: file.path, name: file.name, sessionId })
    messageApi.success(`已复制 "${file.name}"`)
  }

  const handleCut = (file: FileInfo) => {
    setClipboard({ type: 'cut', path: file.path, name: file.name, sessionId })
    messageApi.success(`已剪切 "${file.name}"`)
  }

  const handlePaste = async (targetDir: string) => {
    const clip = clipboard
    if (!clip || clip.sessionId !== sessionId) return

    const targetPath = targetDir === '/' ? `/${clip.name}` : `${targetDir}/${clip.name}`
    const srcPath = clip.path

    // 粘贴到原位：无操作
    if (targetPath === srcPath) {
      messageApi.info('文件已在该位置')
      if (clip.type === 'cut') setClipboard(null)
      return
    }

    try {
      const existing = await window.api.files.stat(sessionId, targetPath).catch(() => null)
      if (existing) {
        messageApi.error(`目标位置已存在 "${clip.name}"`)
        return
      }

      if (clip.type === 'copy') {
        await window.api.files.copy(sessionId, srcPath, targetPath)
        messageApi.success('复制完成')
      } else {
        await window.api.files.rename(sessionId, srcPath, targetPath)
        messageApi.success('剪切完成')
        setClipboard(null)
      }

      // 刷新目标目录
      if (targetDir === currentPath) {
        addFileItem(targetPath)
      } else if (childrenMap[targetDir]) {
        addChildFileItem(targetPath, targetDir)
      } else {
        setLoadedKeys(sessionId, (prev) => prev.filter(k => k !== targetDir))
      }

      // 剪切跨目录时刷新源目录
      if (clip.type === 'cut' && targetPath !== srcPath) {
        const lastSlash = srcPath.lastIndexOf('/')
        const srcDir = lastSlash === 0 ? '/' : srcPath.slice(0, lastSlash)
        if (srcDir === currentPath) {
          removeFile(sessionId, srcPath)
        } else {
          removeChildFile(sessionId, srcDir, srcPath)
          setLoadedKeys(sessionId, (prev) => prev.filter(k => k !== srcDir))
        }
      }
    } catch (err) {
      messageApi.error(`粘贴失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
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
    const trimmedName = createName.trim()
    if (!trimmedName) {
      messageApi.warning('请输入名称')
      return
    }
    if (trimmedName === '.' || trimmedName === '..' || trimmedName.includes('/') || trimmedName.includes('\\')) {
      messageApi.warning('名称不能包含路径分隔符')
      return
    }
    setCreating(true)
    try {
      const newPath = createPath === '/' ? `/${trimmedName}` : `${createPath}/${trimmedName}`
      if (createType === 'folder') {
        await window.api.files.mkdir(sessionId, newPath)
      } else {
        await window.api.files.write(sessionId, newPath, '')
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
      if (canPaste) {
        items.push({ key: 'paste', label: '粘贴', icon: <SnippetsOutlined />, onClick: () => handlePaste(file.path) })
        items.push({ type: 'divider' as const })
      }
    }
    items.push({ key: 'copy', label: '复制', icon: <CopyOutlined />, onClick: () => handleCopy(file) })
    items.push({ key: 'cut', label: '剪切', icon: <ScissorOutlined />, onClick: () => handleCut(file) })
    if (canPaste && !file.isDirectory) {
      const lastSlash = file.path.lastIndexOf('/')
      const parentDir = lastSlash === 0 ? '/' : file.path.slice(0, lastSlash)
      items.push({ key: 'paste', label: '粘贴', icon: <SnippetsOutlined />, onClick: () => handlePaste(parentDir) })
    }
    items.push({ type: 'divider' as const })
    items.push({ key: 'rename', label: '重命名', icon: <EditOutlined />, onClick: () => handleRename(file) })
    if (!file.isDirectory) {
      items.push({ key: 'edit', label: '编辑', icon: <FileTextOutlined />, onClick: () => onEditFile(file) })
      items.push({ key: 'download', label: '下载', icon: <DownloadOutlined />, onClick: () => handleDownload(file) })
    } else {
      items.push({ key: 'download', label: '下载（tar.gz）', icon: <DownloadOutlined />, onClick: () => handleDownload(file) })
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
    const isCut = clipboard?.type === 'cut' && clipboard.path === file.path

    if (isEditing) {
      return {
        key: file.path,
        title: (
          <div className="file-tree-item file-tree-item-editing">
            <span className="file-icon">
              {isDir ? <FolderOutlined style={{ color: 'var(--folder)' }} /> : <FileOutlined style={{ color: 'var(--text-tertiary)' }} />}
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
          <div className={`file-tree-item ${isCut ? 'cut' : ''}`}>
            <span className="file-icon">
              {isDir
                ? (expandedKeys.includes(file.path)
                    ? <FolderOpenOutlined style={{ color: 'var(--folder)' }} />
                    : <FolderOutlined style={{ color: 'var(--folder)' }} />)
                : <FileOutlined style={{ color: 'var(--text-tertiary)' }} />}
            </span>
            <span className="file-name">{file.name}</span>
            {isCut && <ScissorOutlined className="file-cut-badge" />}
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

  const fileByPath = useMemo(() => {
    const index = new Map<string, FileInfo>()
    for (const file of files) index.set(file.path, file)
    for (const children of Object.values(childrenMap)) {
      for (const file of children) index.set(file.path, file)
    }
    return index
  }, [files, childrenMap])

  const treeData = useMemo((): DataNode[] => {
    const rootChildren: DataNode[] = files.map(buildFileNode)
    const rootMenuItems: any[] = [
      { key: 'refresh', label: '刷新', icon: <ReloadOutlined />, onClick: () => { loadFiles(currentPath) } },
      { type: 'divider' as const },
      ...(canPaste
        ? [
          { key: 'paste', label: '粘贴', icon: <SnippetsOutlined />, onClick: () => handlePaste(currentPath) },
          { type: 'divider' as const },
        ]
        : []),
      { key: 'create', label: '新建', icon: <PlusOutlined />, onClick: () => {
        setCreatePath(currentPath); setCreateType('folder'); setCreateName(''); setShowCreateModal(true);
      }},
      { key: 'upload', label: '上传', icon: <UploadOutlined />, onClick: () => handleUpload() },
    ]

    return [{
      key: ROOT_KEY,
      title: (
        <Dropdown menu={{ items: rootMenuItems }} trigger={['contextMenu']}>
          <div className="file-tree-root-label">
            <FolderOpenOutlined className="file-tree-root-icon" />
            <span className="file-tree-root-name">{dirName}</span>
            <Dropdown menu={{ items: rootMenuItems }} trigger={['click']}>
              <Button type="text" size="small" icon={<MoreOutlined />} className="file-action-btn" onClick={(e) => e.stopPropagation()} />
            </Dropdown>
          </div>
        </Dropdown>
      ),
      children: rootChildren,
    }]
  }, [files, childrenMap, currentPath, dirName, expandedKeys, editingKey, editingValue, clipboard, canPaste])

  const handleExpand: TreeProps['onExpand'] = (expandedKeysValue) => {
    setStoreExpandedKeys(sessionId, expandedKeysValue as string[])
  }

  const handleLoadData: TreeProps['loadData'] = async (node) => {
    const key = node.key as string
    if (key === PARENT_KEY || key === ROOT_KEY) return
    const file = fileByPath.get(key)
    if (file?.isDirectory) {
      // Enforce a minimum spinner duration so fast directory loads
      // don't flash the loading icon for a single frame.
      const [result] = await Promise.all([
        loadDirChildren(file.path),
        new Promise((resolve) => setTimeout(resolve, 400)),
      ])
      if (result) setLoadedKeys(sessionId, (prev) => prev.includes(key) ? prev : [...prev, key])
    }
  }

  const handleDoubleClick: TreeProps['onDoubleClick'] = (_info, node) => {
    const key = node.key as string
    if (key === ROOT_KEY) return
    if (key === PARENT_KEY) {
      onPathChange(getParentPath(currentPath))
      return
    }
    const file = fileByPath.get(key)
    if (file?.isDirectory) onPathChange(file.path)
    else if (file) onEditFile(file)
  }

  return (
    <div className="file-browser">
      {contextHolder}
      {modalContextHolder}
      <div className="file-browser-header">
        <div className="file-browser-toolbar">
          <div className="file-browser-toolbar-group">
            <Tooltip title="返回上级">
              <Button size="small" type="text" icon={<RollbackOutlined />} onClick={() => {
                onPathChange(getParentPath(currentPath))
              }} disabled={isRoot} />
            </Tooltip>
            <Tooltip title="刷新">
              <Button size="small" type="text" icon={<ReloadOutlined />} onClick={async () => {
                await loadFiles(currentPath)
                const childKeys = expandedKeys.filter((key) => key !== ROOT_KEY && childrenMap[key])
                const results = await Promise.all(childKeys.map(async (key) => ({ key, result: await loadDirChildren(key) })))
                setLoadedKeys(sessionId, [ROOT_KEY, ...results.filter(({ result }) => result !== null).map(({ key }) => key)])
              }} />
            </Tooltip>
          </div>
          <div className="file-browser-toolbar-group">
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
      <div className="file-browser-content" ref={contentRef}>
        <Spin spinning={loading && files.length === 0} size="small">
          {files.length === 0 && !loading ? (
            <div style={{ padding: '40px 0' }}>
              <Empty description="空目录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          ) : (
            <Tree
              treeData={treeData}
              height={treeHeight || undefined}
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
            />
          )}
        </Spin>
      </div>

      <TransferPanel
        sessionId={sessionId}
        collapsed={transferPanelCollapsed}
        onToggle={() => setTransferPanelCollapsed(!transferPanelCollapsed)}
        onCancel={handleCancelTransfer}
      />

      <Modal
        className="rshell-modal"
        title="新建"
        open={showCreateModal}
        onCancel={() => setShowCreateModal(false)}
        width={360}
        centered
        destroyOnClose
        footer={(
          <div className="rshell-modal-footer">
            <Button onClick={() => setShowCreateModal(false)}>
              取消
            </Button>
            <Button type="primary" onClick={handleCreateConfirm} loading={creating}>
              创建
            </Button>
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

function getParentPath(remotePath: string): string {
  if (remotePath === '/') return '/'
  const normalized = remotePath.replace(/\/+$/, '')
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? '/' : normalized.slice(0, index)
}
