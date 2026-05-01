import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Tree, Button, Space, Modal, Input, AutoComplete, message, Spin, Empty, Tooltip, Dropdown,
  Progress, Badge, Divider, Select, Form,
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
  ArrowUpOutlined,
  EditOutlined,
  FileTextOutlined,
  MoreOutlined,
  PlusOutlined,
  CaretRightOutlined,
  CaretDownOutlined,
  DownOutlined,
  RightOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CaretUpOutlined,
  CaretDownOutlined as CaretDownIcon,
  CloseOutlined,
} from '@ant-design/icons'
import { FileInfo } from '../../shared/types'
import type { DataNode, TreeProps } from 'antd/es/tree'

interface FileBrowserProps {
  sessionId: string
  currentPath: string
  onPathChange: (path: string) => void
  onEditFile: (file: FileInfo) => void
  updatedFile?: FileInfo | null
}

const PARENT_KEY = '__parent__'
const ROOT_KEY = '__root__'

interface TransferItem {
  id: string
  fileName: string
  direction: 'upload' | 'download'
  progress: number
  speed: number
  status: 'transferring' | 'completed' | 'error'
  remotePath: string
  startTime: number
}

let transferIdCounter = 0

export default function FileBrowser({
  sessionId,
  currentPath,
  onPathChange,
  onEditFile,
  updatedFile,
}: FileBrowserProps) {
  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([ROOT_KEY])
  const [loadedKeys, setLoadedKeys] = useState<React.Key[]>([])
  const [childrenMap, setChildrenMap] = useState<Record<string, FileInfo[]>>({})
  const [pathInput, setPathInput] = useState(currentPath)
  const [pathOptions, setPathOptions] = useState<{ value: string; label: React.ReactNode }[]>([])
  const [messageApi, contextHolder] = message.useMessage()
  const [modal, modalContextHolder] = Modal.useModal()
  const loadingDirs = useRef<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const selectingRef = useRef(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  const [transfers, setTransfers] = useState<TransferItem[]>([])
  const [transferPanelCollapsed, setTransferPanelCollapsed] = useState(false)

  // 新建文件/文件夹相关状态
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createPath, setCreatePath] = useState('')
  const [createType, setCreateType] = useState<'folder' | 'file'>('folder')
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)

  const dirName = currentPath === '/' ? '/' : currentPath.split('/').filter(Boolean).pop() || '/'
  const isRoot = currentPath === '/'
  const activeTransfers = transfers.filter((t) => t.status === 'transferring')

  useEffect(() => {
    setPathInput(currentPath)
    setExpandedKeys([ROOT_KEY])
    setSelectedKeys([])
    setChildrenMap({})
    setLoadedKeys([])
  }, [currentPath])

  const loadFiles = useCallback(async (path: string) => {
    setLoading(true)
    try {
      const fileList = await window.api.files.list(sessionId, path)
      setFiles(fileList)
    } catch (err) {
      messageApi.error(`加载文件失败: ${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }, [sessionId, messageApi])

  useEffect(() => {
    loadFiles(currentPath)
  }, [currentPath, loadFiles])

  // 监听单个文件更新（手术级刷新）
  useEffect(() => {
    if (!updatedFile) return

    const updateInList = (list: FileInfo[]) =>
      list.map((f) => (f.path === updatedFile.path ? updatedFile : f))

    // 更新当前目录列表
    setFiles((prev) => updateInList(prev))

    // 更新子目录缓存
    setChildrenMap((prev) => {
      const next = { ...prev }
      for (const [dirPath, list] of Object.entries(next)) {
        next[dirPath] = updateInList(list)
      }
      return next
    })
  }, [updatedFile])

  // 监听真实传输进度
  useEffect(() => {
    const handleProgress = (e: Event) => {
      const { percent, speed } = (e as CustomEvent).detail
      setTransfers((prev) => {
        const idx = prev.findIndex((t) => t.status === 'transferring')
        if (idx === -1) return prev
        const next = [...prev]
        next[idx] = { ...prev[idx], progress: percent, speed: speed || 0 }
        return next
      })
    }
    window.addEventListener('files:progress', handleProgress)
    return () => window.removeEventListener('files:progress', handleProgress)
  }, [])

  const loadDirChildren = useCallback(async (dirPath: string): Promise<FileInfo[]> => {
    if (loadingDirs.current.has(dirPath)) return []
    loadingDirs.current.add(dirPath)
    try {
      const fileList = await window.api.files.list(sessionId, dirPath)
      setChildrenMap((prev) => ({ ...prev, [dirPath]: fileList }))
      return fileList
    } catch (err) {
      messageApi.error(`加载目录失败: ${err instanceof Error ? err.message : '未知错误'}`)
      return []
    } finally {
      loadingDirs.current.delete(dirPath)
    }
  }, [sessionId, messageApi])

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
        .filter((f) => f.isDirectory && f.name.startsWith(prefix))
        .map((f) => {
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

  const handlePathInputChange = useCallback((value: string) => {
    setPathInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchPathSuggestions(value), 300)
  }, [fetchPathSuggestions])

  const handlePathSelect = useCallback((value: string) => {
    selectingRef.current = true
    setPathInput(value)
    setPathOptions([])
    onPathChange(value)
  }, [onPathChange])

  const handlePathSubmit = async () => {
    const trimmed = pathInput.trim()
    if (!trimmed || trimmed === currentPath) return
    try {
      await window.api.files.list(sessionId, trimmed)
      onPathChange(trimmed)
    } catch {
      messageApi.error('路径不存在')
      setPathInput(currentPath)
    }
  }

  const handlePathBlur = () => {
    if (selectingRef.current) { selectingRef.current = false; return }
    handlePathSubmit()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handlePathSubmit() }
  }

  const handleUpload = async () => {
    const localPath = await window.api.app.pickFile({ title: '选择文件' })
    if (!localPath) return
    const fileName = localPath.split('/').pop() || ''
    const remotePath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`
    const id = `upload_${++transferIdCounter}`

    setTransferPanelCollapsed(false)
    setTransfers((prev) => [...prev, {
      id, fileName, direction: 'upload', progress: 0, speed: 0, status: 'transferring', remotePath, startTime: Date.now(),
    }])

    try {
      await window.api.files.upload(sessionId, localPath, remotePath, id)
      setTransfers((prev) => prev.map((t) => t.id === id ? { ...t, progress: 100, speed: 0, status: 'completed' } : t))
      messageApi.success('上传成功')
      loadFiles(currentPath)
    } catch (err) {
      setTransfers((prev) => prev.map((t) => t.id === id ? { ...t, speed: 0, status: 'error' } : t))
      messageApi.error(`上传失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  const handleDownload = async (file: FileInfo) => {
    const localPath = await window.api.app.saveFile({ title: '保存文件', defaultPath: file.name })
    if (!localPath) return
    const id = `download_${++transferIdCounter}`

    setTransferPanelCollapsed(false)
    setTransfers((prev) => [...prev, {
      id, fileName: file.name, direction: 'download', progress: 0, speed: 0, status: 'transferring', remotePath: file.path, startTime: Date.now(),
    }])

    try {
      await window.api.files.download(sessionId, file.path, localPath, id)
      setTransfers((prev) => prev.map((t) => t.id === id ? { ...t, progress: 100, speed: 0, status: 'completed' } : t))
      messageApi.success('下载成功')
    } catch (err) {
      setTransfers((prev) => prev.map((t) => t.id === id ? { ...t, speed: 0, status: 'error' } : t))
      messageApi.error(`下载失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  const handleCancelTransfer = async (id: string) => {
    await window.api.files.cancel(id)
    setTransfers((prev) => prev.map((t) => t.id === id ? { ...t, speed: 0, status: 'error' } : t))
  }

  const handleDelete = async (file: FileInfo) => {
    modal.confirm({
      title: '删除确认',
      content: `确定要删除 "${file.name}" 吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        try {
          await window.api.files.delete(sessionId, file.path)
          messageApi.success('已删除')
          
          // 判断删除的是否是当前目录下的文件
          const lastSlash = file.path.lastIndexOf('/')
          const parentDir = lastSlash === 0 ? '/' : file.path.slice(0, lastSlash)
          
          if (parentDir === currentPath) {
            loadFiles(currentPath)
          } else {
            // 如果是子目录下的文件，刷新该子目录的缓存
            setChildrenMap((prev) => {
              const next = { ...prev }
              delete next[parentDir]
              return next
            })
            setLoadedKeys((prev) => prev.filter(k => k !== parentDir))
          }
        } catch (err) {
          messageApi.error(`删除失败: ${err instanceof Error ? err.message : '未知错误'}`)
        }
      },
    })
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
      // 更新 files 列表
      setFiles((prev) => prev.map((f) =>
        f.path === file.path ? { ...f, name: editingValue, path: newPath } : f
      ))
      // 更新 childrenMap（如果文件在展开的子目录中）
      setChildrenMap((prev) => {
        const next = { ...prev }
        for (const [dirPath, fileList] of Object.entries(next)) {
          next[dirPath] = fileList.map((f) =>
            f.path === file.path ? { ...f, name: editingValue, path: newPath } : f
          )
        }
        return next
      })
      // 更新 expandedKeys 和 selectedKeys 中的旧路径
      setExpandedKeys((prev) => prev.map((k) => k === file.path ? newPath : k))
      setSelectedKeys((prev) => prev.map((k) => k === file.path ? newPath : k))
    } catch (err) {
      messageApi.error(`重命名失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
    setEditingKey(null)
  }

  const handleRenameCancel = () => {
    setEditingKey(null)
  }

  const handleEdit = (file: FileInfo) => {
    const sizeInMB = file.size / (1024 * 1024)
    if (sizeInMB > 5) {
      messageApi.warning(`文件过大 (${sizeInMB.toFixed(1)}MB)，超过 5MB 限制，无法在线编辑`)
      return
    }
    onEditFile(file)
  }

  const handleCreate = (dirPath: string) => {
    setCreatePath(dirPath)
    setCreateType('folder')
    setCreateName('')
    setShowCreateModal(true)
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
      
      // 刷新列表
      if (createPath === currentPath) {
        loadFiles(currentPath)
      } else {
        // 如果是在子目录中创建，清除该目录缓存以触发重新加载
        setChildrenMap((prev) => {
          const next = { ...prev }
          delete next[createPath]
          return next
        })
        setLoadedKeys((prev) => prev.filter(k => k !== createPath))
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
      items.push({ key: 'create', label: '新建', icon: <PlusOutlined />, onClick: () => handleCreate(file.path) })
      items.push({ type: 'divider' as const })
    }
    items.push({ key: 'rename', label: '重命名', icon: <EditOutlined />, onClick: () => handleRename(file) })
    if (!file.isDirectory) {
      items.push({ key: 'edit', label: '编辑', icon: <FileTextOutlined />, onClick: () => handleEdit(file) })
      items.push({ key: 'download', label: '下载', icon: <DownloadOutlined />, onClick: () => handleDownload(file) })
    }
    items.push({ type: 'divider' as const })
    items.push({ key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => handleDelete(file) })
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
              onKeyDown={(e) => { if (e.key === 'Escape') handleRenameCancel() }}
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

  // 优化：使用 useMemo 缓存树结构，避免输入路径时由于全量重渲染导致的卡顿
  const treeData = useMemo((): DataNode[] => {
    const rootChildren: DataNode[] = []
    for (const file of files) {
      rootChildren.push(buildFileNode(file))
    }

    const rootMenuItems: any[] = [
      { key: 'refresh', label: '刷新', icon: <ReloadOutlined />, onClick: () => { setChildrenMap({}); setLoadedKeys([]); loadFiles(currentPath) } },
      { type: 'divider' as const },
      { key: 'create', label: '新建', icon: <PlusOutlined />, onClick: () => handleCreate(currentPath) },
    ]
    if (currentPath !== '/') {
      rootMenuItems.push({ type: 'divider' as const })
      rootMenuItems.push({ key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: async () => {
        modal.confirm({
          title: '删除确认', content: `确定要删除当前目录 "${dirName}" 吗？`, okText: '删除', okType: 'danger', cancelText: '取消',
          centered: true,
          onOk: async () => {
            try { await window.api.files.delete(sessionId, currentPath); messageApi.success('已删除'); const p = currentPath.split('/').filter(Boolean); p.pop(); onPathChange(p.length === 0 ? '/' : `/${p.join('/')}`) }
            catch (err) { messageApi.error(`删除失败: ${err instanceof Error ? err.message : '未知错误'}`) }
          },
        })
      }})
    }

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
    setExpandedKeys(expandedKeysValue as string[])
  }

  const handleLoadData: TreeProps['loadData'] = async (node) => {
    const key = node.key as string
    if (key === PARENT_KEY || key === ROOT_KEY) return
    const file = files.find((f) => f.path === key)
      || Object.values(childrenMap).flat().find((f) => f.path === key)
    if (file?.isDirectory) {
      await loadDirChildren(file.path)
      setLoadedKeys((prev) => [...prev, key])
    }
  }

  const handleSelect: TreeProps['onSelect'] = (selectedKeysValue) => {
    const key = selectedKeysValue[0] as string
    if (!key || key === ROOT_KEY || key === PARENT_KEY) return
    setSelectedKeys(selectedKeysValue)
  }

  const handleDoubleClick: TreeProps['onDoubleClick'] = (_info, node) => {
    const key = node.key as string

    if (key === ROOT_KEY) {
      if (currentPath !== '/') {
        const parts = currentPath.split('/').filter(Boolean)
        parts.pop()
        onPathChange(parts.length === 0 ? '/' : `/${parts.join('/')}`)
      }
      return
    }

    if (key === PARENT_KEY) {
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
              <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => {
                setChildrenMap({}); setLoadedKeys([]); loadFiles(currentPath)
              }} />
            </Tooltip>
            <Tooltip title="上传">
              <Button size="small" type="text" icon={<UploadOutlined />} onClick={handleUpload} />
            </Tooltip>
            <Tooltip title="新建">
              <Button size="small" type="text" icon={<PlusOutlined />} onClick={() => handleCreate(currentPath)} />
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
            onBlur={handlePathBlur}
            onKeyDown={handleKeyDown}
            placeholder="输入路径并回车"
          />
        </div>
      </div>
      <div className="file-browser-content">
        <Spin spinning={loading} size="small">
          {files.length === 0 && !loading && isRoot ? (
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
              onSelect={handleSelect}
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

      <div className="transfer-panel">
        <div
          className="transfer-panel-header"
          onClick={() => setTransferPanelCollapsed(!transferPanelCollapsed)}
        >
          <Space size={6}>
            {activeTransfers.length > 0 ? (
              <Spin size="small" style={{ scale: '0.8' }} />
            ) : transfers.length > 0 ? (
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
            ) : (
              <DownloadOutlined style={{ color: '#8e8e93', fontSize: 12 }} />
            )}
            <span className="transfer-panel-title">
              传输队列 {activeTransfers.length > 0 ? `(${activeTransfers.length})` : ''}
            </span>
          </Space>
          <div style={{ fontSize: '10px', color: '#bfbfbf' }}>
            {transferPanelCollapsed ? <CaretUpOutlined /> : <CaretDownIcon />}
          </div>
        </div>
        {!transferPanelCollapsed && (
          <div className="transfer-panel-body">
            {transfers.length === 0 ? (
              <div className="transfer-panel-empty" style={{ padding: '20px 0', textAlign: 'center', fontSize: '12px', color: '#bfbfbf' }}>暂无传输任务</div>
            ) : (
              [...transfers].reverse().map((t) => (
                <div key={t.id} className="transfer-item">
                  <div className="transfer-item-info" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ flexShrink: 0 }}>
                      {t.direction === 'upload' ? (
                        <UploadOutlined style={{ color: '#1677ff', fontSize: '12px' }} />
                      ) : (
                        <DownloadOutlined style={{ color: '#52c41a', fontSize: '12px' }} />
                      )}
                    </span>
                    <span className="transfer-item-name" style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.fileName}</span>
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {t.status === 'transferring' && (
                        <>
                          <span style={{ fontSize: '10px', color: '#8c8c8c' }}>{formatSpeed(t.speed)}</span>
                          <Button type="text" size="small" icon={<CloseOutlined style={{ fontSize: '10px' }} />} onClick={(e) => { e.stopPropagation(); handleCancelTransfer(t.id) }} />
                        </>
                      )}
                      {t.status === 'completed' && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '12px' }} />}
                      {t.status === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: '12px' }} />}
                    </div>
                  </div>
                  {t.status === 'transferring' && (
                    <Progress percent={t.progress} size="small" showInfo={false} strokeWidth={2} strokeColor="#1677ff" style={{ margin: 0, lineHeight: 1 }} />
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

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
            borderBottomLeftRadius: '8px',
            borderBottomRightRadius: '8px',
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
              options={[
                { value: 'folder', label: '文件夹' },
                { value: 'file', label: '文件' },
              ]}
            />
          </Form.Item>
          <Form.Item label="名称" required style={{ marginBottom: 0 }}>
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

function formatSpeed(speed: number): string {
  if (speed < 1) return '<1 KB/s'
  if (speed < 1024) return `${Math.round(speed)} KB/s`
  return `${(speed / 1024).toFixed(1)} MB/s`
}
