import type {
  AppInfo,
  ScanItem,
  ScanProgress,
  CleanResult,
  StartupItem,
  ProcessItem,
  PrivacyItem,
  BigFileItem,
  DuplicateGroup,
  UninstallItem,
  LeftoverItem,
  LeftoverReport,
  MovePreset,
  MoveProgress,
  MoveResult,
  ScheduleConfig,
  ScheduleStatus,
  Lang
} from '../../shared/types'

interface Api {
  appInfo(): Promise<AppInfo>
  /** 打开系统文件夹选择框，取消时返回空字符串 */
  pickFolder(opts: { title: string; defaultPath?: string }): Promise<string>
  junkScan(ids: string[] | null): Promise<ScanItem[]>
  junkClean(ids: string[]): Promise<CleanResult>
  junkCancel(): Promise<boolean>
  onJunkScanProgress(cb: (p: ScanProgress) => void): () => void
  onJunkCleanProgress(cb: (p: ScanProgress) => void): () => void
  privacyScan(): Promise<PrivacyItem[]>
  privacyClean(ids: string[]): Promise<CleanResult>
  startupList(): Promise<StartupItem[]>
  startupToggle(id: string, enable: boolean, lang: Lang): Promise<{ ok: boolean; message: string }>
  processList(): Promise<ProcessItem[]>
  processKill(pid: number, lang: Lang): Promise<{ ok: boolean; message: string }>
  bigRoots(): Promise<string[]>
  findBig(roots: string[], minMB: number): Promise<BigFileItem[]>
  findDup(roots: string[]): Promise<DuplicateGroup[]>
  deleteFiles(paths: string[]): Promise<{ files: number; errors: string[] }>
  onBigProgress(cb: (p: string) => void): () => void
  onDupProgress(cb: (p: number) => void): () => void
  uninstallList(): Promise<UninstallItem[]>
  uninstallRemove(item: UninstallItem, lang: Lang): Promise<{ ok: boolean; message: string; interactive?: boolean }>
  uninstallLeftovers(item: UninstallItem): Promise<LeftoverReport>
  cleanLeftovers(items: LeftoverItem[]): Promise<{ ok: number; bytes: number; errors: string[] }>
  movePresets(): Promise<MovePreset[]>
  moveDrives(): Promise<string[]>
  moveSize(dir: string): Promise<number>
  moveDefaultTarget(src: string, drive: string): Promise<string>
  moveRun(src: string, dest: string, lang: Lang): Promise<MoveResult>
  onMoveProgress(cb: (p: MoveProgress) => void): () => void
  scheduleGet(): Promise<ScheduleStatus>
  scheduleSave(cfg: ScheduleConfig, lang: Lang): Promise<ScheduleStatus>
  scheduleRunNow(lang: Lang): Promise<CleanResult>

  // 系统优化
  optimizeItems(): Promise<{ id: string; group: string; needRestartExplorer?: boolean }[]>
  optimizeScan(): Promise<{ id: string; group: string; applied: boolean; needRestartExplorer?: boolean }[]>
  optimizeApply(ids: string[]): Promise<{ itemId: string; ok: boolean; errors: string[]; needRestartExplorer?: boolean }[]>
  optimizeUndo(ids: string[]): Promise<{ itemId: string; ok: boolean; errors: string[] }[]>
  optimizeUndoAll(): Promise<{ itemId: string; ok: boolean; errors: string[] }[]>
  optimizeRestartExplorer(): Promise<void>

  // 全面体检
  diagnoseRun(): Promise<{
    score: number
    junkBytes: number
    junkFiles: number
    startupDisabled: number
    startupTotal: number
    privacyIds: string[]
    optimizeApplied: number
    optimizeTotal: number
    tips: string[]
  }>
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
