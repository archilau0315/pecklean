import { contextBridge, ipcRenderer } from 'electron'

const api = {
  appInfo: () => ipcRenderer.invoke('app:info'),

  junkScan: (ids: string[] | null) => ipcRenderer.invoke('junk:scan', ids),
  junkClean: (ids: string[]) => ipcRenderer.invoke('junk:clean', ids),
  onJunkScanProgress: (cb: (p: unknown) => void) => {
    const fn = (_e: unknown, p: unknown): void => cb(p)
    ipcRenderer.on('junk:scan-progress', fn)
    return () => ipcRenderer.removeListener('junk:scan-progress', fn)
  },

  privacyScan: () => ipcRenderer.invoke('privacy:scan'),
  privacyClean: (ids: string[]) => ipcRenderer.invoke('privacy:clean', ids),

  startupList: () => ipcRenderer.invoke('startup:list'),
  startupToggle: (id: string, enable: boolean) => ipcRenderer.invoke('startup:toggle', id, enable),
  processList: () => ipcRenderer.invoke('process:list'),
  processKill: (pid: number) => ipcRenderer.invoke('process:kill', pid),

  bigRoots: () => ipcRenderer.invoke('files:bigRoots'),
  findBig: (roots: string[], minMB: number) => ipcRenderer.invoke('files:big', roots, minMB),
  findDup: (root: string) => ipcRenderer.invoke('files:duplicates', root),
  deleteFiles: (paths: string[]) => ipcRenderer.invoke('files:delete', paths),
  onBigProgress: (cb: (p: unknown) => void) => {
    const fn = (_e: unknown, p: unknown) => cb(p)
    ipcRenderer.on('files:big-progress', fn)
    return () => ipcRenderer.removeListener('files:big-progress', fn)
  },
  onDupProgress: (cb: (p: unknown) => void) => {
    const fn = (_e: unknown, p: unknown): void => cb(p)
    ipcRenderer.on('files:dup-progress', fn)
    return () => ipcRenderer.removeListener('files:dup-progress', fn)
  },

  uninstallList: () => ipcRenderer.invoke('uninstall:list'),
  uninstallRemove: (item: unknown) => ipcRenderer.invoke('uninstall:remove', item),
  uninstallLeftovers: (item: unknown) => ipcRenderer.invoke('uninstall:leftovers', item),
  cleanLeftovers: (items: unknown[]) => ipcRenderer.invoke('uninstall:cleanLeftovers', items),

  movePresets: () => ipcRenderer.invoke('move:presets'),
  moveDrives: () => ipcRenderer.invoke('move:drives'),
  moveSize: (dir: string) => ipcRenderer.invoke('move:size', dir),
  moveDefaultTarget: (src: string, drive: string) => ipcRenderer.invoke('move:defaultTarget', src, drive),
  moveRun: (src: string, dest: string) => ipcRenderer.invoke('move:run', src, dest),
  onMoveProgress: (cb: (p: unknown) => void) => {
    const fn = (_e: unknown, p: unknown): void => cb(p)
    ipcRenderer.on('move:progress', fn)
    return () => ipcRenderer.removeListener('move:progress', fn)
  },

  scheduleGet: () => ipcRenderer.invoke('schedule:get'),
  scheduleSave: (cfg: unknown) => ipcRenderer.invoke('schedule:save', cfg),
  scheduleRunNow: () => ipcRenderer.invoke('schedule:runNow')
}

contextBridge.exposeInMainWorld('api', api)
