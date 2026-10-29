import { useEffect, useState } from 'react'
import { formatBytes } from './fmt'
import type { UninstallItem, LeftoverItem } from '../../../shared/types'

export default function Uninstall(): React.JSX.Element {
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
    if (!confirm(`卸载 ${app.name}？\n将调用软件自带的卸载程序，可能需要 UAC 确认。`)) return
    setBusyId(app.id)
    try {
      const r = await window.api.uninstallRemove(app)
      setMsg(r.message)
      await load()
      await findLeftovers(app)
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
      if (res.items.length === 0) setMsg(`${app.name}：未发现残留`)
      else if (res.installed) setMsg(`${app.name} 仍处于安装状态，下面列出的是它的正常文件，建议卸载后再清理`)
      else {
        setMsg(`发现 ${res.items.length} 项残留，已默认勾选`)
        setChecked(new Set(res.items.map((r) => r.id)))
      }
    } finally {
      setScanning(false)
    }
  }

  const cleanLeft = async (): Promise<void> => {
    const items = leftovers.filter((l) => checked.has(l.id))
    if (!items.length || !confirm(`清理选中的 ${items.length} 项残留？不可恢复！`)) return
    const r = await window.api.cleanLeftovers(items)
    setMsg(`已清理 ${r.ok} 项残留${r.bytes ? `，释放 ${formatBytes(r.bytes)}` : ''}${r.errors.length ? `，${r.errors.length} 项失败` : ''}`)
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
        <h1>软件卸载</h1>
        <div className="actions">
          <button className="btn" onClick={load} disabled={loading || !!busyId}>
            {loading ? '读取中…' : '刷新列表'}
          </button>
        </div>
      </div>
      {msg && <div className="result-box">{msg}</div>}
      <div className="filter-row">
        <input
          className="text-input grow"
          placeholder="搜索软件名称或厂商"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <span className="muted small">共 {apps.length} 个软件</span>
      </div>
      {loading && <div className="progress-line">正在读取注册表…</div>}

      {!loading && (
        <div className="category">
          {shown.map((a) => (
            <div key={a.id} className="item-row">
              <span className="item-name">{a.name}</span>
              <span className="item-samples" title={`${a.publisher} ${a.installLocation}`}>
                {a.version || '未知版本'}
                {a.publisher ? ` · ${a.publisher}` : ''}
              </span>
              <span className="item-size">{a.sizeKB ? formatBytes(a.sizeKB * 1024) : '-'}</span>
              <button className="btn small" onClick={() => findLeftovers(a)}>
                扫描残留
              </button>
              <button className="btn small danger" onClick={() => remove(a)} disabled={!!busyId}>
                {busyId === a.id ? '卸载中…' : '卸载'}
              </button>
            </div>
          ))}
          {shown.length === 0 && <div className="empty-state">没有匹配的软件</div>}
        </div>
      )}

      {leftApp && (
        <div className="category">
          <div className="page-head">
            <div className="category-title">{leftApp.name} 的残留项</div>
            <button className="btn small primary" onClick={cleanLeft} disabled={scanning || !checked.size}>
              清理选中 ({checked.size})
            </button>
          </div>
          {scanning && <div className="progress-line">正在扫描注册表、安装目录与快捷方式…</div>}
          {!scanning &&
            leftovers.map((l) => (
              <label key={l.id} className="item-row">
                <input type="checkbox" checked={checked.has(l.id)} onChange={() => toggle(l.id)} />
                <span className="item-name">{l.desc}</span>
                <span className="item-samples" title={l.path}>
                  {l.path}
                </span>
                <span className="item-size">{l.bytes ? formatBytes(l.bytes) : '-'}</span>
              </label>
            ))}
          {!scanning && leftovers.length === 0 && <div className="empty-state">未发现残留项</div>}
        </div>
      )}
    </div>
  )
}
