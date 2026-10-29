import { useEffect, useState } from 'react'
import { formatBytes } from './fmt'
import { useI18n } from '../i18n'
import { movePresetName } from '../i18n/helpers'
import type { MovePreset, MoveProgress } from '../../../shared/types'

export default function Move(): React.JSX.Element {
  const { t, lang } = useI18n()
  const [presets, setPresets] = useState<MovePreset[]>([])
  const [drives, setDrives] = useState<string[]>([])
  const [src, setSrc] = useState('')
  const [drive, setDrive] = useState('')
  const [dest, setDest] = useState('')
  const [manualDest, setManualDest] = useState(false)
  const [size, setSize] = useState(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<MoveProgress | null>(null)
  const [msg, setMsg] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    Promise.all([window.api.movePresets(), window.api.moveDrives()]).then(([p, d]) => {
      setPresets(p)
      setDrives(d)
      setDrive(d.find((x) => x !== 'C:') ?? d[0] ?? '')
    })
  }, [])

  useEffect(() => {
    if (!src.trim() || !drive || manualDest) return
    let alive = true
    window.api.moveDefaultTarget(src.trim(), drive).then((t) => {
      if (alive) setDest(t)
    })
    return () => {
      alive = false
    }
  }, [src, drive, manualDest])

  useEffect(() => {
    if (!src.trim()) {
      setSize(0)
      return
    }
    let alive = true
    window.api.moveSize(src.trim()).then((s) => {
      if (alive) setSize(s)
    })
    return () => {
      alive = false
    }
  }, [src])

  // 系统文件夹选择框：原目录与新位置都可直接在资源管理器里点选
  const pickSrc = async (): Promise<void> => {
    const p = await window.api.pickFolder({ title: t('move.pickSrc') })
    if (p) {
      setSrc(p)
      setManualDest(false)
    }
  }

  const pickDest = async (): Promise<void> => {
    const p = await window.api.pickFolder({ title: t('move.pickDest'), defaultPath: dest || undefined })
    if (p) {
      setDest(p)
      setManualDest(true)
    }
  }

  const start = async (): Promise<void> => {
    if (!src.trim() || !dest.trim()) return
    if (!confirm(t('move.confirm', { src, dest }))) return
    setBusy(true)
    setMsg('')
    setFailed(false)
    setProgress({ phase: t('move.preparing'), percent: 0 })
    const off = window.api.onMoveProgress(setProgress)
    try {
      const r = await window.api.moveRun(src.trim(), dest.trim(), lang)
      setMsg(r.message)
      setFailed(!r.ok)
      if (r.ok) setSrc('')
    } finally {
      off()
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('move.title')}</h1>
        <span className="muted small">{t('move.subtitle')}</span>
      </div>
      {msg && <div className={`result-box ${failed ? 'warn' : ''}`}>{msg}</div>}

      {presets.length > 0 && (
        <div className="category">
          <div className="category-title">{t('move.presets')}</div>
          <div className="preset-row">
            {presets.map((p) => (
              <button key={p.path} className={`chip ${src === p.path ? 'active' : ''}`} onClick={() => setSrc(p.path)} title={p.path}>
                {movePresetName(t, p)} · {formatBytes(p.bytes)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="category">
        <div className="category-title">{t('move.settings')}</div>
        <div className="form-row">
          <span className="form-label">{t('move.src')}</span>
          <input
            className="text-input grow"
            placeholder={t('move.srcPlaceholder')}
            value={src}
            onChange={(e) => {
              setSrc(e.target.value)
              setManualDest(false)
            }}
            disabled={busy}
          />
          <button className="btn" onClick={pickSrc} disabled={busy}>
            {t('move.choose')}
          </button>
        </div>
        <div className="form-row">
          <span className="form-label">{t('move.drive')}</span>
          <div className="preset-row">
            {drives.map((d) => (
              <button
                key={d}
                className={`chip ${drive === d ? 'active' : ''}`}
                onClick={() => setDrive(d)}
                disabled={busy}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="form-row">
          <span className="form-label">{t('move.dest')}</span>
          <input
            className="text-input grow"
            placeholder={t('move.destPlaceholder')}
            value={dest}
            onChange={(e) => {
              setDest(e.target.value)
              setManualDest(true)
            }}
            disabled={busy}
          />
          <button className="btn" onClick={pickDest} disabled={busy}>
            {t('move.choose')}
          </button>
        </div>
        {src && size > 0 && <div className="muted small">{t('move.sizeHint', { size: formatBytes(size) })}</div>}

        {progress && (
          <div className="progressbar">
            <div className="progressbar-fill" style={{ width: `${progress.percent}%` }} />
            <span className="progressbar-text">
              {progress.phase} {progress.percent}%
            </span>
          </div>
        )}

        <div className="actions" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={start} disabled={busy || !src.trim() || !dest.trim()}>
            {busy ? t('move.busy') : t('move.start')}
          </button>
        </div>
      </div>

      <div className="tip-box">
        <b>{t('move.tip.title')}</b>
        <ul>
          <li>{t('move.tip.1')}</li>
          <li>{t('move.tip.2')}</li>
          <li>{t('move.tip.3')}</li>
          <li>{t('move.tip.4')}</li>
        </ul>
      </div>
    </div>
  )
}
