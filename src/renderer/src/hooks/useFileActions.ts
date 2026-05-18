import { useCallback, useRef } from 'react'
import { message } from 'antd'
import { FileInfo } from '../../../shared/types'
import { useSessionStore, TransferItem } from '../store/useSessionStore'

export function useFileActions(sessionId: string) {
  const {
    sessions,
    setFiles,
    updateChildren,
    setLoadedKeys,
    upsertFile,
    removeFile,
    upsertChildFile,
    removeChildFile,
    addTransfer,
    updateTransfer,
  } = useSessionStore()

  const sessionState = sessions[sessionId] || { currentPath: '~', files: [], childrenMap: {}, loadedKeys: [] }
  const currentPath = sessionState.currentPath
  const childrenMap = sessionState.childrenMap
  const loadingDirs = useRef<Set<string>>(new Set())

  const loadFiles = useCallback(async (path: string) => {
    try {
      const fileList = await window.api.files.list(sessionId, path)
      setFiles(sessionId, fileList)
      setLoadedKeys(sessionId, ['__root__'])
    } catch (err) {
      message.error(`加载文件失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }, [sessionId, setFiles, setLoadedKeys])

  const refreshFiles = useCallback(async (path: string) => {
    try {
      const fileList = await window.api.files.list(sessionId, path)
      setFiles(sessionId, fileList)
    } catch (err) {
      message.error(`刷新文件列表失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }, [sessionId, setFiles])

  const loadDirChildren = useCallback(async (dirPath: string): Promise<FileInfo[]> => {
    if (loadingDirs.current.has(dirPath)) return []
    loadingDirs.current.add(dirPath)
    try {
      const fileList = await window.api.files.list(sessionId, dirPath)
      updateChildren(sessionId, dirPath, fileList)
      return fileList
    } catch (err) {
      message.error(`加载目录失败: ${err instanceof Error ? err.message : '未知错误'}`)
      return []
    } finally {
      loadingDirs.current.delete(dirPath)
    }
  }, [sessionId, updateChildren])

  const addFileItem = useCallback(async (filePath: string) => {
    try {
      const stat = await window.api.files.stat(sessionId, filePath)
      upsertFile(sessionId, stat)
    } catch {
      const lastSlash = filePath.lastIndexOf('/')
      const parentDir = lastSlash === 0 ? '/' : filePath.slice(0, lastSlash)
      if (parentDir === currentPath) loadFiles(currentPath)
    }
  }, [sessionId, currentPath, upsertFile, loadFiles])

  const addChildFileItem = useCallback(async (filePath: string, dirPath: string) => {
    try {
      const stat = await window.api.files.stat(sessionId, filePath)
      upsertChildFile(sessionId, dirPath, stat)
    } catch {
      setLoadedKeys(sessionId, (prev) => prev.filter(k => k !== dirPath))
    }
  }, [sessionId, upsertChildFile, setLoadedKeys])

  const handleUpload = useCallback(async (targetDirPath?: string) => {
    const uploadPath = targetDirPath || currentPath
    const localPath = await window.api.app.pickFile({ title: '选择文件' })
    if (!localPath) return
    const fileName = localPath.split('/').pop() || ''
    const remotePath = uploadPath === '/' ? `/${fileName}` : `${uploadPath}/${fileName}`
    const id = `upload_${Date.now()}`

    addTransfer({
      id,
      fileName,
      direction: 'upload',
      progress: 0,
      speed: 0,
      status: 'transferring',
      remotePath,
      startTime: Date.now(),
    })

    try {
      await window.api.files.upload(sessionId, localPath, remotePath, id)
      updateTransfer(id, { progress: 100, speed: 0, status: 'completed' })
      message.success('上传成功')

      if (uploadPath === currentPath) {
        addFileItem(remotePath)
      } else if (childrenMap[uploadPath]) {
        addChildFileItem(remotePath, uploadPath)
        setLoadedKeys(sessionId, (prev) => prev.filter(k => k !== uploadPath))
      } else {
        setLoadedKeys(sessionId, (prev) => prev.filter(k => k !== uploadPath))
      }
    } catch (err) {
      updateTransfer(id, { speed: 0, status: 'error' })
      message.error(`上传失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }, [sessionId, currentPath, childrenMap, addTransfer, updateTransfer, addFileItem, addChildFileItem, loadFiles])

  const handleDownload = useCallback(async (file: FileInfo) => {
    const localPath = await window.api.app.saveFile({ title: '保存文件', defaultPath: file.name })
    if (!localPath) return
    const id = `download_${Date.now()}`

    addTransfer({
      id,
      fileName: file.name,
      direction: 'download',
      progress: 0,
      speed: 0,
      status: 'transferring',
      remotePath: file.path,
      startTime: Date.now(),
    })

    try {
      await window.api.files.download(sessionId, file.path, localPath, id)
      updateTransfer(id, { progress: 100, speed: 0, status: 'completed' })
      message.success('下载成功')
    } catch (err) {
      updateTransfer(id, { speed: 0, status: 'error' })
      message.error(`下载失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }, [sessionId, addTransfer, updateTransfer])

  const handleDelete = useCallback(async (file: FileInfo) => {
    try {
      await window.api.files.delete(sessionId, file.path)
      message.success('已删除')

      const lastSlash = file.path.lastIndexOf('/')
      const parentDir = lastSlash === 0 ? '/' : file.path.slice(0, lastSlash)

      if (parentDir === currentPath) {
        await refreshFiles(currentPath)
      } else if (childrenMap[parentDir]) {
        removeChildFile(sessionId, parentDir, file.path)
        setLoadedKeys(sessionId, (prev) => prev.filter(k => k !== parentDir))
      } else {
        removeFile(sessionId, file.path)
      }
    } catch (err) {
      message.error(`删除失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }, [sessionId, currentPath, childrenMap, refreshFiles, removeFile, removeChildFile, setLoadedKeys])

  return {
    loadFiles,
    loadDirChildren,
    addFileItem,
    addChildFileItem,
    handleUpload,
    handleDownload,
    handleDelete,
  }
}
