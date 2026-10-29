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
  ScheduleStatus
} from '../../shared/types'

interface Api {
  appInfo(): Promise<AppInfo>
  junkScan(ids: string[] | null): Promise<ScanItem[]>
  junkClean(ids: string[]): Promise<CleanResult>
  onJunkScanProgress(cb: (p: ScanProgress) => void): () => void
  privacyScan(): Promise<PrivacyItem[]>
  privacyClean(ids: string[]): Promise<CleanResult>
  startupList(): Promise<StartupItem[]>
  startupToggle(id: string, enable: boolean): Promise<{ ok: boolean; message: string }>
  processList(): Promise<ProcessItem[]>
  processKill(pid: number): Promise<{ ok: boolean; message: string }>
  bigRoots(): Promise<string[]>
  findBig(roots: string[], minMB: number): Promise<BigFileItem[]>
  findDup(root: string): Promise<DuplicateGroup[]>
  deleteFiles(paths: string[]): Promise<{ files: number; errors: string[] }>
  onBigProgress(cb: (p: string) => void): () => void
  onDupProgress(cb: (p: number) => void): () => void
  uninstallList(): Promise<UninstallItem[]>
  uninstallRemove(item: UninstallItem): Promise<{ ok: boolean; message: string }>
  uninstallLeftovers(item: UninstallItem): Promise<LeftoverReport>
  cleanLeftovers(items: LeftoverItem[]): Promise<{ ok: number; bytes: number; errors: string[] }>
  movePresets(): Promise<MovePreset[]>
  moveDrives(): Promise<string[]>
  moveSize(dir: string): Promise<number>
  moveDefaultTarget(src: string, drive: string): Promise<string>
  moveRun(src: string, dest: string): Promise<MoveResult>
  onMoveProgress(cb: (p: MoveProgress) => void): () => void
  scheduleGet(): Promise<ScheduleStatus>
  scheduleSave(cfg: ScheduleConfig): Promise<ScheduleStatus>
  scheduleRunNow(): Promise<CleanResult>
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
