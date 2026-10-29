import { useEffect, useState } from 'react'
import { formatBytes, formatDate } from './fmt'
import { useI18n } from '../i18n'
import type { BigFileItem, DuplicateGroup } from '../../../shared/types'

export default function Files(): React.JSX.Element {
  const { t } = useI18n()
  const [tab, setTab] = useState<'big' | 'dup'>('big')
  const [roots, setRoots] = useState<string[]>([])
  const [root, setRoot] = useState('')
  const [minMB, setMinMB] = useState(100)
  const [bigFiles, setBigFiles] = useState<BigFileItem[]>([])
  const [dupGroups, setDupGroups] = useState<DuplicateGroup[]>([])
  const [dupChecked, setDupChecked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    window.api.bigRoots().then((r) => {
      setRoots(r)
      setRoot(r[0] ?? '')
    })
  }, [])

  const scanBig = async (): Promise<void> => {
    setBusy(true)
    setBigFiles([])
    const off = window.api.onBigProgress((p) => setProgress(t('files.progress.big', { path: p })))
    try {
      setBigFiles(await window.api.findBig(roots, minMB))
    } finally {
      off()
      setBusy(false)
      setProgress('')
    }
  }

  const scanDup = async (): Promise<void> => {
    if (!root) return
    setBusy(true)
    setDupGroups([])
    setDupChecked(new Set())
    const off = window.api.onDupProgress((n) => setProgress(t('files.progress.dup', { n })))
    try {
      setDupGroups(await window.api.findDup(root))
    } finally {
      off()
      setBusy(false)
      setProgress('')
    }
  }

  const deleteBig = async (paths: string[]): Promise<void> => {
    if (!paths.length || !confirm(t('files.confirmBig', { n: paths.length }))) return
    const r = await window.api.deleteFiles(paths)
    setMsg(
      t('files.deleted', { n: r.files }) + (r.errors.length ? t('files.deletedFail', { n: r.errors.length }) : '')
    )
    setBigFiles((prev) => prev.filter((f) => !paths.includes(f.path)))
  }

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
          {bigFiles.map((f) => (
            <div key={f.path} className="item-row">
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
            <span>{t('files.scanDir')}</span>
            <input className="text-input grow" value={root} onChange={(e) => setRoot(e.target.value)} placeholder={t('files.dupPlaceholder')} />
            <button className="btn primary" onClick={scanDup} disabled={busy || !root}>
              {t('files.scan')}
            </button>
          </div>
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
          {dupGroups.map((g) => (
            <div key={g.hash} className="dup-group">
              <div className="category-title">
                {t('files.dupGroup', { n: g.files.length, size: formatBytes(g.files[0]?.bytes ?? 0) })}
              </div>
              {g.files.map((f, idx) => (
                <label key={f.path} className="item-row">
                  <input type="checkbox" disabled={idx === 0} checked={dupChecked.has(f.path)} onChange={() => toggleDup(f.path)} />
                  <span className="item-samples grow" title={f.path}>
                    {f.path}
                  </span>
                  {idx === 0 && <span className="badge on">{t('files.keep')}</span>}
                </label>
              ))}
            </div>
          ))}
          {!busy && dupGroups.length === 0 && <div className="empty-state">{t('files.empty.dup')}</div>}
        </>
      )}
    </div>
  )
}
