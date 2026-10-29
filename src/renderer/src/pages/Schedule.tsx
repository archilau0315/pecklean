import { useEffect, useState } from 'react'
import { formatBytes } from './fmt'
import { useI18n } from '../i18n'
import type { ScheduleStatus, ScheduleConfig } from '../../../shared/types'

export default function Schedule(): React.JSX.Element {
  const { t, lang } = useI18n()
  const [status, setStatus] = useState<ScheduleStatus | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [time, setTime] = useState('03:00')
  const [privacy, setPrivacy] = useState(true)
  const [recycleBin, setRecycleBin] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [failed, setFailed] = useState(false)

  const load = async (): Promise<void> => {
    const s = await window.api.scheduleGet()
    setStatus(s)
    setEnabled(s.enabled)
    setTime(s.time)
    setPrivacy(s.privacy)
    setRecycleBin(s.recycleBin)
  }

  useEffect(() => {
    load()
  }, [])

  const save = async (): Promise<void> => {
    setBusy(true)
    setFailed(false)
    try {
      const cfg: ScheduleConfig = {
        enabled,
        time,
        junkIds: status?.junkIds ?? [],
        privacy,
        recycleBin
      }
      const s = await window.api.scheduleSave(cfg, lang)
      setStatus(s)
      setMsg(
        s.enabled
          ? t('schedule.savedOn', { time: s.time }) + (s.taskExists ? '' : t('schedule.taskWarn'))
          : t('schedule.savedOff')
      )
      setFailed(s.enabled && !s.taskExists)
    } catch (e) {
      setMsg(t('schedule.saveFail', { msg: (e as Error).message }))
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const runNow = async (): Promise<void> => {
    if (!confirm(t('schedule.confirm'))) return
    setBusy(true)
    setFailed(false)
    try {
      const r = await window.api.scheduleRunNow(lang)
      setMsg(
        t('schedule.done', { files: r.files, size: formatBytes(r.bytes) }) +
          (r.errors.length ? t('schedule.skipped', { n: r.errors.length }) : '')
      )
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('schedule.title')}</h1>
        <span className="muted small">{t('schedule.subtitle')}</span>
      </div>
      {msg && <div className={`result-box ${failed ? 'warn' : ''}`}>{msg}</div>}

      <div className="category">
        <div className="item-row static">
          <span className="item-name">{t('schedule.enable')}</span>
          <span className="item-samples">{t('schedule.enableDesc')}</span>
          <span className={`badge ${enabled ? 'on' : 'off'}`}>{enabled ? t('schedule.on') : t('schedule.off')}</span>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </div>

        <div className="form-row">
          <span className="form-label">{t('schedule.time')}</span>
          <input className="time-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>

        <label className="item-row static">
          <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
          <span className="item-name">{t('schedule.privacy')}</span>
          <span className="item-samples">{t('schedule.privacyDesc')}</span>
        </label>
        <label className="item-row static">
          <input type="checkbox" checked={recycleBin} onChange={(e) => setRecycleBin(e.target.checked)} />
          <span className="item-name">{t('schedule.recycle')}</span>
          <span className="item-samples">{t('schedule.recycleDesc')}</span>
        </label>
      </div>

      <div className="tip-box">
        <b>{t('schedule.tip.title')}</b>
        <ul>
          <li>{t('schedule.tip.1')}</li>
          <li>{t('schedule.tip.2')}</li>
          <li>{t('schedule.tip.3')}</li>
        </ul>
      </div>

      <div className="actions">
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? t('schedule.saving') : t('schedule.save')}
        </button>
        <button className="btn" onClick={runNow} disabled={busy}>
          {t('schedule.runNow')}
        </button>
        <span className="spacer" />
        <span className={`badge ${status?.taskExists ? 'on' : 'off'}`}>
          {status?.taskExists ? t('schedule.task.on') : t('schedule.task.off')}
        </span>
      </div>

      {status?.log && (
        <div className="category">
          <div className="category-title">{t('schedule.log')}</div>
          <pre className="log-box">{status.log}</pre>
        </div>
      )}
    </div>
  )
}
