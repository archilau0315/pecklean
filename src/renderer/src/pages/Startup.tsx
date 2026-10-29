import { useEffect, useState } from 'react'
import { formatBytes } from './fmt'
import type { StartupItem, ProcessItem } from '../../../shared/types'

export default function Startup(): React.JSX.Element {
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
    if (item.hive === 'HKLM' && !confirm(`${item.name} 在系统注册表中，需要 UAC 提权，继续？`)) return
    const r = await window.api.startupToggle(item.id, !item.enabled)
    setMsg(`${item.name}: ${r.message}`)
    loadStartup()
  }

  const kill = async (p: ProcessItem): Promise<void> => {
    if (!confirm(`结束进程 ${p.name} (${p.pid})？未保存的数据可能丢失。`)) return
    const r = await window.api.processKill(p.pid)
    setMsg(`${p.name}: ${r.message}`)
    loadProcs()
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>电脑加速</h1>
        <div className="tabs">
          <button className={`tab ${tab === 'startup' ? 'active' : ''}`} onClick={() => setTab('startup')}>
            启动项
          </button>
          <button className={`tab ${tab === 'process' ? 'active' : ''}`} onClick={() => setTab('process')}>
            进程管理
          </button>
        </div>
      </div>
      {msg && <div className="result-box">{msg}</div>}
      {loading && <div className="progress-line">加载中…</div>}

      {tab === 'startup' && !loading && (
        <div className="category">
          {items.map((i) => (
            <div key={i.id} className="item-row">
              <span className="item-name">
                {i.name}
                <span className={`badge ${i.enabled ? 'on' : 'off'}`}>{i.enabled ? '启用' : '已禁用'}</span>
              </span>
              <span className="item-samples" title={i.command}>
                {i.command}（{i.location}）
              </span>
              <button className="btn small" onClick={() => toggle(i)}>
                {i.enabled ? '禁用' : '启用'}
              </button>
            </div>
          ))}
          {items.length === 0 && <div className="empty-state">未发现启动项</div>}
        </div>
      )}

      {tab === 'process' && !loading && (
        <div className="category">
          {procs.map((p) => (
            <div key={p.pid} className="item-row">
              <span className="item-name">{p.name}</span>
              <span className="item-samples">PID {p.pid}</span>
              <span className="item-size">{formatBytes(p.memMB * 1024 * 1024)}</span>
              <button className="btn small danger" onClick={() => kill(p)}>
                结束
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
