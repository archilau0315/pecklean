import { useEffect, useState } from 'react'
import { formatBytes, formatDate } from './fmt'
import { useI18n } from '../i18n'
import type { BigFileItem, DuplicateGroup } from '../../../shared/types'

export default function Files(): React.JSX.Element {
  const { t } = useI18n()
  const [tab, setTab] = useState<'big' | 'dup'>('big')
  const [roots, setRoots] = useState<string[]>([])
  const [minMB, setMinMB] = useState(100)
  const [bigFiles, setBigFiles] = useState<BigFileItem[]>([])
  const [bigChecked, setBigChecked] = useState<Set<string>>(new Set())
  const [dupGroups, setDupGroups] = useState<DuplicateGroup[]>([])
  const [dupChecked, setDupChecked] = useState<Set<string>>(new Set())
  const [dupMode, setDupMode] = useState<'all' | 'drives' | 'folders'>('all')
  const [drives, setDrives] = useState<string[]>([])
  const [diskPick, setDiskPick] = useState<string[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [scope, setScope] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    window.api.bigRoots().then(setRoots)
    window.api.moveDrives().then((d) => {
      setDrives(d)
      setDiskPick(d)
    })
  }, [])

  const scanBig = async (): Promise<void> => {
    setBusy(true)
    setBigFiles([])
    setBigChecked(new Set())
    const off = window.api.onBigProgress((p) => setProgress(t('files.progress.big', { path: p })))
    try {
      setBigFiles(await window.api.findBig(roots, minMB))
    } finally {
      off()
      setBusy(false)
      setProgress('')
    }
  }

  /** 全盘模式取本机所有磁盘；指定磁盘/文件夹模式取用户勾选的范围 */
  const dupRoots = async (): Promise<string[]> => {
    if (dupMode === 'all') return await window.api.moveDrives()
    if (dupMode === 'drives') return diskPick
    return folders
  }

  const scanDup = async (): Promise<void> => {
    const target = await dupRoots()
    if (!target.length) {
      setMsg(t('files.dupNoTarget'))
      return
    }
    setBusy(true)
    setDupGroups([])
    setDupChecked(new Set())
    setScope(target)
    const off = window.api.onDupProgress((n) => setProgress(t('files.progress.dup', { n })))
    try {
      setDupGroups(await window.api.findDup(target))
    } finally {
      off()
      setBusy(false)
      setProgress('')
    }
  }

  const addFolder = async (): Promise<void> => {
    const p = await window.api.pickFolder({ title: t('files.dupAddFolder') })
    if (p) setFolders((prev) => (prev.includes(p) ? prev : [...prev, p]))
  }

  const deleteBig = async (paths: string[]): Promise<void> => {
    if (!paths.length || !confirm(t('files.confirmBig', { n: paths.length }))) return
    const r = await window.api.deleteFiles(paths)
    setMsg(
      t('files.deleted', { n: r.files }) + (r.errors.length ? t('files.deletedFail', { n: r.errors.length }) : '')
    )
    setBigFiles((prev) => prev.filter((f) => !paths.includes(f.path)))
    setBigChecked((prev) => new Set([...prev].filter((p) => !paths.includes(p))))
  }

  const toggleBig = (p: string): void => {
    setBigChecked((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const allBigChecked = bigFiles.length > 0 && bigChecked.size === bigFiles.length

  const deleteDup = async (): Promise<void> => {
    if (!dupChecked.size || !confirm(t('files.confirmDup', { n: dupChecked.size }))) return
    const r = await window.api.deleteFiles([...dupChecked])
    setMsg(t('files.dupDeleted', { n: r.files }))
    setDupGroups((prev) =>
      prev
        .map((g) => ({ ...g, files: g.files.filter((f) => !dupChecked.has(f.path)) }))
        .filter((g) => g.files.length >= 1)
    )
    setDupChecked(new Set())
  }

  const toggleDup = (p: string): void => {
    setDupChecked((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const toggleGroup = (g: DuplicateGroup, on: boolean): void => {
    setDupChecked((prev) => {
      const next = new Set(prev)
      for (const f of g.files) {
        if (on) next.add(f.path)
        else next.delete(f.path)
      }
      return next
    })
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('files.title')}</h1>
        <div className="tabs">
          <button className={`tab ${tab === 'big' ? 'active' : ''}`} onClick={() => setTab('big')}>
            {t('files.tab.big')}
          </button>
          <button className={`tab ${tab === 'dup' ? 'active' : ''}`} onClick={() => setTab('dup')}>
            {t('files.tab.dup')}
          </button>
        </div>
      </div>
      {msg && <div className="result-box">{msg}</div>}
      {busy && <div className="progress-line">{progress || t('files.scanning')}</div>}

      {tab === 'big' && (
        <>
          <div className="filter-row">
            <span>{t('files.scanRoots')}</span>
            {roots.map((r) => (
              <label key={r} className="chip">
                <input
                  type="checkbox"
                  checked={roots.includes(r) && roots.length >= 0}
                  onChange={() =>
                    setRoots((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))
                  }
                />
                {r.split('\\').pop()}
              </label>
            ))}
            <span className="spacer" />
            <span>{t('files.greaterThan')}</span>
            <input type="number" value={minMB} min={1} onChange={(e) => setMinMB(+e.target.value || 100)} />
            <span>MB</span>
            <button className="btn primary" onClick={scanBig} disabled={busy || !roots.length}>
              {t('files.scan')}
            </button>
          </div>
          {bigFiles.length > 0 && (
            <div className="filter-row">
              <label className="chip">
                <input
                  type="checkbox"
                  checked={allBigChecked}
                  onChange={() => setBigChecked(allBigChecked ? new Set() : new Set(bigFiles.map((f) => f.path)))}
                />
                {allBigChecked ? t('files.deselectAll') : t('files.selectAll')}
              </label>
              <span className="spacer" />
              <button className="btn danger" onClick={() => deleteBig([...bigChecked])} disabled={busy || !bigChecked.size}>
                {t('files.deleteSelected', { n: bigChecked.size })}
              </button>
            </div>
          )}
          {bigFiles.map((f) => (
            <div key={f.path} className="item-row">
              <input type="checkbox" checked={bigChecked.has(f.path)} onChange={() => toggleBig(f.path)} />
              <span className="item-samples grow" title={f.path}>
                {f.path}
              </span>
              <span className="item-size">{formatBytes(f.bytes)}</span>
              <span className="item-samples">{formatDate(f.modified)}</span>
              <button className="btn small danger" onClick={() => deleteBig([f.path])}>
                {t('files.delete')}
              </button>
            </div>
          ))}
          {!busy && bigFiles.length === 0 && <div className="empty-state">{t('files.empty.big')}</div>}
        </>
      )}

      {tab === 'dup' && (
        <>
          <div className="filter-row">
            <span>{t('files.dupMode')}</span>
            {(['all', 'drives', 'folders'] as const).map((m) => (
              <button
                key={m}
                className={`chip ${dupMode === m ? 'active' : ''}`}
                onClick={() => setDupMode(m)}
                disabled={busy}
              >
                {t(`files.mode.${m}`)}
              </button>
            ))}
            <span className="spacer" />
            <button className="btn primary" onClick={scanDup} disabled={busy}>
              {t('files.scan')}
            </button>
          </div>

          {dupMode === 'all' && (
            <div className="muted small" style={{ marginBottom: 10 }}>
              {t('files.mode.allHint', { drives: drives.join('、') })}
            </div>
          )}

          {dupMode === 'drives' && (
            <div className="filter-row">
              {drives.map((d) => (
                <label key={d} className="chip">
                  <input
                    type="checkbox"
                    checked={diskPick.includes(d)}
                    disabled={busy}
                    onChange={() =>
                      setDiskPick((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
          )}

          {dupMode === 'folders' && (
            <>
              <div className="filter-row">
                <button className="btn" onClick={addFolder} disabled={busy}>
                  {t('files.dupAddFolder')}
                </button>
                {!folders.length && <span className="muted small">{t('files.mode.foldersHint')}</span>}
              </div>
              {folders.map((f) => (
                <div key={f} className="filter-row">
                  <span className="item-samples grow" title={f}>
                    {f}
                  </span>
                  <button className="btn small" onClick={() => setFolders((prev) => prev.filter((x) => x !== f))} disabled={busy}>
                    {t('files.dupRemove')}
                  </button>
                </div>
              ))}
            </>
          )}

          {!busy && scope.length > 0 && (
            <div className="muted small" style={{ marginBottom: 10 }}>
              {t('files.dupScope', { list: scope.join('、') })}
            </div>
          )}
          {dupGroups.length > 0 && (
            <div className="page-head">
              <span className="muted">
                {t('files.dupFound', {
                  n: dupGroups.length,
                  size: formatBytes(dupGroups.reduce((s, g) => s + g.files[0].bytes * (g.files.length - 1), 0))
                })}
              </span>
              <button className="btn danger" onClick={deleteDup} disabled={!dupChecked.size}>
                {t('files.dupDelete', { n: dupChecked.size })}
              </button>
            </div>
          )}
          {dupGroups.map((g) => {
            const allPicked = g.files.every((f) => dupChecked.has(f.path))
            return (
              <div key={g.hash} className="dup-group">
                <div className="category-title">
                  {t('files.dupGroup', { n: g.files.length, size: formatBytes(g.files[0]?.bytes ?? 0) })}
                  <button className="btn small" onClick={() => toggleGroup(g, !allPicked)}>
                    {allPicked ? t('files.groupNone') : t('files.groupAll')}
                  </button>
                </div>
                {g.files.map((f) => (
                  <label key={f.path} className="item-row">
                    <input type="checkbox" checked={dupChecked.has(f.path)} onChange={() => toggleDup(f.path)} />
                    <span className="item-samples grow" title={f.path}>
                      {f.path}
                    </span>
                    <span className="item-size">{formatBytes(f.bytes)}</span>
                  </label>
                ))}
              </div>
            )
          })}
          {!busy && dupGroups.length === 0 && <div className="empty-state">{t('files.empty.dup')}</div>}
        </>
      )}
    </div>
  )
}
