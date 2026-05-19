import { app, shell, BrowserWindow, Menu, nativeTheme, ipcMain } from 'electron'
import { join } from 'node:path'
import { IPCManager } from './ipc.js'

// 禁用自动填充以减少开发工具中的内部报错 (如 Autofill.setAddresses failed)
app.commandLine.appendSwitch('disable-autofill')
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication')

let mainWindow: BrowserWindow | null = null
let ipcManager: IPCManager | null = null
let isQuitting = false

function createWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    return
  }

  const iconPath = join(__dirname, '../../resources/icon.png')
  // ... rest of the code

  mainWindow = new BrowserWindow({
    width: 1080,
    height: 700,
    minWidth: 1080,
    minHeight: 700,
    title: 'RShell',
    icon: iconPath,
    show: false,
    frame: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
  })

  if (process.platform === 'darwin') {
    app.dock?.setIcon(iconPath)
  }

  ipcManager = new IPCManager(mainWindow)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  ipcMain.on('sessions:connect-and-setup', async (_event, configId: string) => {
    if (!ipcManager || !mainWindow) return
    try {
      const session = await ipcManager.openSession(configId)
      mainWindow.webContents.send('sessions:connected', session)
    } catch (err) {
      mainWindow.webContents.send('sessions:connect-error', {
        configId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  ipcMain.handle('sessions:open-shell', async (_event, sessionId: string, size: { cols: number; rows: number }) => {
    if (!ipcManager || !mainWindow) return
    ipcManager.setupShellCallbacks(sessionId, mainWindow, size)
  })

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.handle('window:close', () => {
    if (process.platform === 'darwin') {
      mainWindow?.hide()
    } else {
      mainWindow?.close()
    }
  })

  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    ipcManager = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createMenu(): void {
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'RShell',
      submenu: [
        { label: '关于 RShell', role: 'about' },
        { type: 'separator' },
        {
          label: '设置...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow?.webContents.send('menu:open-settings')
          },
        },
        { type: 'separator' },
        { label: '隐藏 RShell', role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出 RShell', role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '粘贴并匹配样式', role: 'pasteAndMatchStyle' },
        { label: '删除', role: 'delete' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        ...(isDev
          ? [
              { label: '重新加载', role: 'reload' as const },
              { label: '强制重新加载', role: 'forceReload' as const },
              { label: '切换开发者工具', role: 'toggleDevTools' as const },
              { type: 'separator' as const }
            ]
          : []),
        { label: '重置缩放', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '切换全屏', role: 'togglefullscreen' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '缩放', role: 'zoom' },
        { type: 'separator' },
        { label: '前置全部窗口', role: 'front' },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(() => {
  createMenu()
  createWindow()

  app.on('activate', () => {
    createWindow()
  })
})

app.on('window-all-closed', () => {
  ipcManager?.disconnectAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  ipcManager?.disconnectAll()
})
