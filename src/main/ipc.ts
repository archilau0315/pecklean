/** IPC 注册：渲染进程唯一入口 */
import { ipcMain, app, BrowserWindow, dialog } from 'electron'
import { scanJunk, cleanJunk, JUNK_IDS } from './core/junk'
import { scanPrivacy, cleanPrivacy } from './core/privacy'
import { listStartup, toggleStartup, listProcesses, killProcess } from './core/startup'
import { findBigFiles, findDuplicates, deleteFiles, DEFAULT_BIG_ROOTS } from './core/files'
import { listApps, uninstallApp, scanLeftovers, cleanLeftovers } from './core/uninstall'
import { listPresets, listDrives, dirSize, defaultTarget, moveDirectory } from './core/move'
import { getScheduleStatus, saveSchedule, runAutoClean } from './core/schedule'
import { AppInfo, UninstallItem, LeftoverItem, ScheduleConfig } from '../shared/types'

function push(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

export function registerIpc(): void {
  ipcMain.handle('app:info', (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node
  }))

  // ── 系统目录选择框 ──
  ipcMain.handle(
    'dialog:pickFolder',
    async (_e, opts: { title: string; defaultPath?: string }): Promise<string> => {
      const win = BrowserWindow.getAllWindows()[0]
      const options: Electron.OpenDialogOptions = {
        title: opts.title,
        defaultPath: opts.defaultPath,
        properties: ['openDirectory', 'createDirectory']
      }
      const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      return res.canceled || !res.filePaths.length ? '' : res.filePaths[0]
    }
  )

  // ── 垃圾清理 ──
  ipcMain.handle('junk:scan', async (_e, ids: string[] | null) =>
    scanJunk(ids, (p) => push('junk:scan-progress', p))
  )
  ipcMain.handle('junk:clean', (_e, ids: string[]) => cleanJunk(ids))
  ipcMain.handle('junk:ids', () => JUNK_IDS)

  // ── 隐私清理 ──
  ipcMain.handle('privacy:scan', () => scanPrivacy())
  ipcMain.handle('privacy:clean', (_e, ids: string[]) => cleanPrivacy(ids))

  // ── 电脑加速 ──
  ipcMain.handle('startup:list', () => listStartup())
  ipcMain.handle('startup:toggle', (_e, id: string, enable: boolean) => toggleStartup(id, enable))
  ipcMain.handle('process:list', () => listProcesses())
  ipcMain.handle('process:kill', (_e, pid: number) => killProcess(pid))

  // ── 大文件/重复文件 ──
  ipcMain.handle('files:bigRoots', () => DEFAULT_BIG_ROOTS)
  ipcMain.handle(
    'files:big',
    (_e, roots: string[], minMB: number) =>
      findBigFiles(roots, minMB, (current) => push('files:big-progress', current))
  )
  ipcMain.handle(
    'files:duplicates',
    (_e, root: string) =>
      findDuplicates(root, (scanned) => push('files:dup-progress', scanned))
  )
  ipcMain.handle('files:delete', (_e, paths: string[]) => deleteFiles(paths))

  // ── 软件卸载 ──
  ipcMain.handle('uninstall:list', () => listApps())
  ipcMain.handle('uninstall:remove', (_e, appItem: UninstallItem) => uninstallApp(appItem))
  ipcMain.handle('uninstall:leftovers', (_e, appItem: UninstallItem) => scanLeftovers(appItem))
  ipcMain.handle('uninstall:cleanLeftovers', (_e, items: LeftoverItem[]) => cleanLeftovers(items))

  // ── 目录搬移 ──
  ipcMain.handle('move:presets', () => listPresets())
  ipcMain.handle('move:drives', () => listDrives())
  ipcMain.handle('move:size', (_e, dir: string) => dirSize(dir))
  ipcMain.handle('move:defaultTarget', (_e, src: string, drive: string) => defaultTarget(src, drive))
  ipcMain.handle(
    'move:run',
    (_e, src: string, dest: string) =>
      moveDirectory(src, dest, (p) => push('move:progress', p))
  )

  // ── 定时清理 ──
  ipcMain.handle('schedule:get', () => getScheduleStatus())
  ipcMain.handle('schedule:save', (_e, cfg: ScheduleConfig) => saveSchedule(cfg))
  ipcMain.handle('schedule:runNow', () => runAutoClean())
}
