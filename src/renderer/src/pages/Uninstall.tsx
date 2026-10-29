import { useEffect, useState } from 'react'
import { formatBytes } from './fmt'
import { useI18n } from '../i18n'
import { leftoverLabel } from '../i18n/helpers'
import type { UninstallItem, LeftoverItem } from '../../../shared/types'

export default function Uninstall(): React.JSX.Element {
  const { t, lang } = useI18n()
  const [apps, setApps] = useState<UninstallItem[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [msg, setMsg] = useState('')
  const [leftApp, setLeftApp] = useState<UninstallItem | null>(null)
  const [leftovers, setLeftovers] = useState<LeftoverItem[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      setApps(await window.api.uninstallList())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const remove = async (app: UninstallItem): Promise<void> => {
    if (!confirm(t('uninstall.confirm', { name: app.name }))) return
    setBusyId(app.id)
    try {
      const r = await window.api.uninstallRemove(app, lang)
      setMsg(r.message)
      await load()
      // 交互式卸载程序仍在运行，等用户完成后自行点「扫描残留」，避免误删正在卸载的文件
      if (!r.interactive) await findLeftovers(app)
    } finally {
      setBusyId('')
    }
  }

  const findLeftovers = async (app: UninstallItem): Promise<void> => {
    setLeftApp(app)
    setLeftovers([])
    setChecked(new Set())
    setScanning(true)
    try {
      const res = await window.api.uninstallLeftovers(app)
      setLeftovers(res.items)
      if (res.items.length === 0) setMsg(t('uninstall.noLeft', { name: app.name }))
      else if (res.installed) setMsg(t('uninstall.stillInstalled', { name: app.name }))
      else {
        setMsg(t('uninstall.foundLeft', { n: res.items.length }))
        setChecked(new Set(res.items.map((r) => r.id)))
      }
    } finally {
      setScanning(false)
    }
  }

  const cleanLeft = async (): Promise<void> => {
    const items = leftovers.filter((l) => checked.has(l.id))
    if (!items.length || !confirm(t('uninstall.confirmLeft', { n: items.length }))) return
    const r = await window.api.cleanLeftovers(items)
    setMsg(
      t('uninstall.leftDone', { n: r.ok }) +
        (r.bytes ? t('uninstall.leftDoneSize', { size: formatBytes(r.bytes) }) : '') +
        (r.errors.length ? t('uninstall.leftDoneFail', { n: r.errors.length }) : '')
    )
    setLeftovers((prev) => prev.filter((l) => !checked.has(l.id)))
    setChecked(new Set())
  }

  const toggle = (id: string): void => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const shown = apps.filter(
    (a) => !keyword || a.name.toLowerCase().includes(keyword.toLowerCase()) || a.publisher.toLowerCase().includes(keyword.toLowerCase())
  )

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('uninstall.title')}</h1>
        <div className="actions">
          <button className="btn" onClick={load} disabled={loading || !!busyId}>
            {loading ? t('uninstall.loading') : t('uninstall.refresh')}
          </button>
        </div>
      </div>
      {msg && <div className="result-box">{msg}</div>}
      <div className="filter-row">
        <input
          className="text-input grow"
          placeholder={t('uninstall.search')}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <span className="muted small">{t('uninstall.total', { n: apps.length })}</span>
      </div>
      {loading && <div className="progress-line">{t('uninstall.reading')}</div>}

      {!loading && (
        <div className="category">
          {shown.map((a) => (
            <div key={a.id} className="item-row">
              <span className="item-name">{a.name}</span>
              <span className="item-samples" title={`${a.publisher} ${a.installLocation}`}>
                {a.version || t('uninstall.version.unknown')}
                {a.publisher ? ` · ${a.publisher}` : ''}
              </span>
              <span className="item-size">{a.sizeKB ? formatBytes(a.sizeKB * 1024) : '-'}</span>
              <button className="btn small" onClick={() => findLeftovers(a)}>
                {t('uninstall.scanLeft')}
              </button>
              <button className="btn small danger" onClick={() => remove(a)} disabled={!!busyId}>
                {busyId === a.id ? t('uninstall.removing') : t('uninstall.remove')}
              </button>
            </div>
          ))}
          {shown.length === 0 && <div className="empty-state">{t('uninstall.empty')}</div>}
        </div>
      )}

      {leftApp && (
        <div className="category">
          <div className="page-head">
            <div className="category-title">{t('uninstall.leftTitle', { name: leftApp.name })}</div>
            <button className="btn small primary" onClick={cleanLeft} disabled={scanning || !checked.size}>
              {t('uninstall.leftClean', { n: checked.size })}
            </button>
          </div>
          {scanning && <div className="progress-line">{t('uninstall.leftScanning')}</div>}
          {!scanning &&
            leftovers.map((l) => (
              <label key={l.id} className="item-row">
                <input type="checkbox" checked={checked.has(l.id)} onChange={() => toggle(l.id)} />
                <span className="item-name">{leftoverLabel(t, l)}</span>
                <span className="item-samples" title={l.path}>
                  {l.path}
                </span>
                <span className="item-size">{l.bytes ? formatBytes(l.bytes) : '-'}</span>
              </label>
            ))}
          {!scanning && leftovers.length === 0 && <div className="empty-state">{t('uninstall.leftEmpty')}</div>}
        </div>
      )}
    </div>
  )
}
