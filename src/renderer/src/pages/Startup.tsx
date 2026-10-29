import { useEffect, useState } from 'react'
import { formatBytes } from './fmt'
import { useI18n } from '../i18n'
import { startupLocation } from '../i18n/helpers'
import type { StartupItem, ProcessItem } from '../../../shared/types'

export default function Startup(): React.JSX.Element {
  const { t, lang } = useI18n()
  const [tab, setTab] = useState<'startup' | 'process'>('startup')
  const [items, setItems] = useState<StartupItem[]>([])
  const [procs, setProcs] = useState<ProcessItem[]>([])
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const loadStartup = async (): Promise<void> => {
    setLoading(true)
    try {
      setItems(await window.api.startupList())
    } finally {
      setLoading(false)
    }
  }
  const loadProcs = async (): Promise<void> => {
    setLoading(true)
    try {
      setProcs(await window.api.processList())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'startup') loadStartup()
    else loadProcs()
  }, [tab])

  const toggle = async (item: StartupItem): Promise<void> => {
    if (item.hive === 'HKLM' && !confirm(t('startup.uacConfirm', { name: item.name }))) return
    const r = await window.api.startupToggle(item.id, !item.enabled, lang)
    setMsg(`${item.name}: ${r.message}`)
    loadStartup()
  }

  const kill = async (p: ProcessItem): Promise<void> => {
    if (!confirm(t('startup.killConfirm', { name: p.name, pid: p.pid }))) return
    const r = await window.api.processKill(p.pid, lang)
    setMsg(`${p.name}: ${r.message}`)
    loadProcs()
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('startup.title')}</h1>
        <div className="tabs">
          <button className={`tab ${tab === 'startup' ? 'active' : ''}`} onClick={() => setTab('startup')}>
            {t('startup.tab.startup')}
          </button>
          <button className={`tab ${tab === 'process' ? 'active' : ''}`} onClick={() => setTab('process')}>
            {t('startup.tab.process')}
          </button>
        </div>
      </div>
      {msg && <div className="result-box">{msg}</div>}
      {loading && <div className="progress-line">{t('startup.loading')}</div>}

      {tab === 'startup' && !loading && (
        <div className="category">
          {items.map((i) => (
            <div key={i.id} className="item-row">
              <span className="item-name">
                {i.name}
                <span className={`badge ${i.enabled ? 'on' : 'off'}`}>
                  {i.enabled ? t('startup.enabled') : t('startup.disabled')}
                </span>
              </span>
              <span className="item-samples" title={i.command}>
                {t('startup.commandWithLoc', { command: i.command, location: startupLocation(t, i) })}
              </span>
              <button className="btn small" onClick={() => toggle(i)}>
                {i.enabled ? t('startup.disable') : t('startup.enable')}
              </button>
            </div>
          ))}
          {items.length === 0 && <div className="empty-state">{t('startup.empty')}</div>}
        </div>
      )}

      {tab === 'process' && !loading && (
        <div className="category">
          {procs.map((p) => (
            <div key={p.pid} className="item-row">
              <span className="item-name">{p.name}</span>
              <span className="item-samples">{t('startup.pid', { pid: p.pid })}</span>
              <span className="item-size">{formatBytes(p.memMB * 1024 * 1024)}</span>
              <button className="btn small danger" onClick={() => kill(p)}>
                {t('startup.kill')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
