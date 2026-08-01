import { useCallback, useRef } from 'react'
import { message } from 'antd'
import { FileInfo } from '../../../shared/types'
import { useSessionStore } from '../store/useSessionStore'

export function useFileActions(sessionId: string) {
  const sessionState = useSessionStore((state) => state.sessions[sessionId])
    || { currentPath: '~', files: [], childrenMap: {}, loadedKeys: [], expandedKeys: [] }
  const setFiles = useSessionStore((state) => state.setFiles)
  const updateChildren = useSessionStore((state) => state.updateChildren)
  const setLoadedKeys = useSessionStore((state) => state.setLoadedKeys)
  const upsertFile = useSessionStore((state) => state.upsertFile)
  const removeFile = useSessionStore((state) => state.removeFile)
  const upsertChildFile = useSessionStore((state) => state.upsertChildFile)
  const removeChildFile = useSessionStore((state) => state.removeChildFile)
  const addTransfer = useSessionStore((state) => state.addTransfer)
  const updateTransfer = useSessionStore((state) => state.updateTransfer)
  const currentPath = sessionState.currentPath
  const childrenMap = sessionState.childrenMap
  const loadingDirs = useRef<Map<string, Promise<FileInfo[] | null>>>(new Map())
  const listRequestRef = useRef(0)

  const loadFiles = useCallback(async (path: string): Promise<boolean> => {
    const requestId = ++listRequestRef.current
    try {
      const fileList = await window.api.files.list(sessionId, path)
      const activePath = useSessionStore.getState().sessions[sessionId]?.currentPath
      if (requestId !== listRequestRef.current || activePath !== path) return false
      setFiles(sessionId, fileList)
      setLoadedKeys(sessionId, ['__root__'])
      return true
    } catch (err) {
      if (requestId !== listRequestRef.current) return false
      message.error(`加载文件失败: ${err instanceof Error ? err.message : '未知错误'}`)
      return false
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

  const loadDirChildren = useCallback((dirPath: string): Promise<FileInfo[] | null> => {
    // Share the in-flight request: rc-tree can trigger loadData multiple
    // times for one expansion (StrictMode double-invoked setState updater
    // plus TreeNode's load effect). Every caller must await the SAME real
    // request, otherwise a fast null return ends the loading state early
    // and the spinner flickers on and off.
    const inFlight = loadingDirs.current.get(dirPath)
    if (inFlight) return inFlight
    const request = (async () => {
      try {
        const fileList = await window.api.files.list(sessionId, dirPath)
        updateChildren(sessionId, dirPath, fileList)
        return fileList
      } catch (err) {
        message.error(`加载目录失败: ${err instanceof Error ? err.message : '未知错误'}`)
        return null
      } finally {
        loadingDirs.current.delete(dirPath)
      }
    })()
    loadingDirs.current.set(dirPath, request)
    return request
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
    const fileName = localPath.split(/[\\/]/).pop() || ''
    const remotePath = uploadPath === '/' ? `/${fileName}` : `${uploadPath}/${fileName}`
    const id = `upload_${crypto.randomUUID()}`

    addTransfer({
      id,
      sessionId,
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
    const isDir = file.isDirectory
    const fileName = isDir ? `${file.name}.tar.gz` : file.name
    const localPath = await window.api.app.saveFile({ title: '保存文件', defaultPath: fileName })
    if (!localPath) return
    const id = `download_${crypto.randomUUID()}`

    addTransfer({
      id,
      sessionId,
      fileName,
      direction: 'download',
      progress: isDir ? -1 : 0,
      speed: 0,
      status: 'transferring',
      remotePath: file.path,
      startTime: Date.now(),
    })

    try {
      if (isDir) {
        await window.api.files.downloadDir(sessionId, file.path, localPath, id)
      } else {
        await window.api.files.download(sessionId, file.path, localPath, id)
      }
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
