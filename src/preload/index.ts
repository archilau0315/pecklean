import { contextBridge, ipcRenderer } from 'electron'

const api = {
  appInfo: () => ipcRenderer.invoke('app:info'),
  pickFolder: (opts: { title: string; defaultPath?: string }) => ipcRenderer.invoke('dialog:pickFolder', opts),

  junkScan: (ids: string[] | null) => ipcRenderer.invoke('junk:scan', ids),
  junkClean: (ids: string[]) => ipcRenderer.invoke('junk:clean', ids),
  junkCancel: () => ipcRenderer.invoke('junk:cancel'),
  onJunkScanProgress: (cb: (p: unknown) => void) => {
    const fn = (_e: unknown, p: unknown): void => cb(p)
    ipcRenderer.on('junk:scan-progress', fn)
    return () => ipcRenderer.removeListener('junk:scan-progress', fn)
  },
  onJunkCleanProgress: (cb: (p: unknown) => void) => {
    const fn = (_e: unknown, p: unknown): void => cb(p)
    ipcRenderer.on('junk:clean-progress', fn)
    return () => ipcRenderer.removeListener('junk:clean-progress', fn)
  },

  privacyScan: () => ipcRenderer.invoke('privacy:scan'),
  privacyClean: (ids: string[]) => ipcRenderer.invoke('privacy:clean', ids),

  startupList: () => ipcRenderer.invoke('startup:list'),
  startupToggle: (id: string, enable: boolean, lang: string) => ipcRenderer.invoke('startup:toggle', id, enable, lang),
  processList: () => ipcRenderer.invoke('process:list'),
  processKill: (pid: number, lang: string) => ipcRenderer.invoke('process:kill', pid, lang),

  bigRoots: () => ipcRenderer.invoke('files:bigRoots'),
  findBig: (roots: string[], minMB: number) => ipcRenderer.invoke('files:big', roots, minMB),
  findDup: (roots: string[]) => ipcRenderer.invoke('files:duplicates', roots),
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
  uninstallRemove: (item: unknown, lang: string) => ipcRenderer.invoke('uninstall:remove', item, lang),
  uninstallLeftovers: (item: unknown) => ipcRenderer.invoke('uninstall:leftovers', item),
  cleanLeftovers: (items: unknown[]) => ipcRenderer.invoke('uninstall:cleanLeftovers', items),

  movePresets: () => ipcRenderer.invoke('move:presets'),
  moveDrives: () => ipcRenderer.invoke('move:drives'),
  moveSize: (dir: string) => ipcRenderer.invoke('move:size', dir),
  moveDefaultTarget: (src: string, drive: string) => ipcRenderer.invoke('move:defaultTarget', src, drive),
  moveRun: (src: string, dest: string, lang: string) => ipcRenderer.invoke('move:run', src, dest, lang),
  onMoveProgress: (cb: (p: unknown) => void) => {
    const fn = (_e: unknown, p: unknown): void => cb(p)
    ipcRenderer.on('move:progress', fn)
    return () => ipcRenderer.removeListener('move:progress', fn)
  },

  scheduleGet: () => ipcRenderer.invoke('schedule:get'),
  scheduleSave: (cfg: unknown, lang: string) => ipcRenderer.invoke('schedule:save', cfg, lang),
  scheduleRunNow: (lang: string) => ipcRenderer.invoke('schedule:runNow', lang),

  optimizeItems: () => ipcRenderer.invoke('optimize:items'),
  optimizeScan: () => ipcRenderer.invoke('optimize:scan'),
  optimizeApply: (ids: string[]) => ipcRenderer.invoke('optimize:apply', ids),
  optimizeUndo: (ids: string[]) => ipcRenderer.invoke('optimize:undo', ids),
  optimizeUndoAll: () => ipcRenderer.invoke('optimize:undoAll'),
  optimizeRestartExplorer: () => ipcRenderer.invoke('optimize:restartExplorer'),

  diagnoseRun: () => ipcRenderer.invoke('diagnose:run'),

  systemDrives: () => ipcRenderer.invoke('system:drives'),
  systemDefragAnalyze: (drive: string) => ipcRenderer.invoke('system:defragAnalyze', drive),
  systemDefragRun: (drive: string) => ipcRenderer.invoke('system:defragRun', drive),
  onSystemDefragProgress: (cb: (p: { drive: string; msg: string }) => void) => {
    const fn = (_e: unknown, p: unknown): void => cb(p as { drive: string; msg: string })
    ipcRenderer.on('system:defrag-progress', fn)
    return () => ipcRenderer.removeListener('system:defrag-progress', fn)
  },
  systemMemoryInfo: () => ipcRenderer.invoke('system:memoryInfo'),
  systemMemoryBoost: () => ipcRenderer.invoke('system:memoryBoost'),
  onSystemMemoryProgress: (cb: (msg: string) => void) => {
    const fn = (_e: unknown, p: unknown): void => cb(String(p))
    ipcRenderer.on('system:memory-progress', fn)
    return () => ipcRenderer.removeListener('system:memory-progress', fn)
  }
}

contextBridge.exposeInMainWorld('api', api)
