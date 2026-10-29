import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { runAutoClean } from './core/schedule'

let win: BrowserWindow | null = null

/** 计划任务以 --autoclean 启动：静默清理后退出，不显示窗口 */
const AUTO_CLEAN = process.argv.includes('--autoclean')

// 开发模式开启远程调试，便于自动化验证 UI
if (process.env.NODE_ENV === 'development' && !AUTO_CLEAN) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 900,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    title: 'SurperClean 清理工具',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (AUTO_CLEAN) {
  app.whenReady().then(async () => {
    await runAutoClean()
    app.quit()
  })
} else {
  app.whenReady().then(() => {
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
