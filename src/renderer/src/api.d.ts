import type {
  AppInfo,
  ScanItem,
  ScanProgress,
  CleanResult,
  StartupItem,
  ProcessItem,
  PrivacyItem,
  BigFileItem,
  DuplicateGroup
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
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
