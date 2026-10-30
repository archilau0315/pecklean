/** 系统优化 — 注册表级可回滚，14 项分 6 组 */
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'

interface ScanRow {
  id: string
  group: string
  applied: boolean
  needRestartExplorer?: boolean
}

interface OptItem {
  id: string
  group: string
  needRestartExplorer?: boolean
}

export default function Optimize(): React.JSX.Element {
  const { t } = useI18n()
  const [items, setItems] = useState<OptItem[]>([])
  const [rows, setRows] = useState<ScanRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'scan' | 'apply' | 'undo' | null>(null)
  const [notice, setNotice] = useState<string>('')

  const load = async (): Promise<void> => {
    setBusy('scan')
    try {
      const [it, sc] = await Promise.all([
        window.api.optimizeItems(),
        window.api.optimizeScan()
      ])
      setItems(it as OptItem[])
      setRows(sc as ScanRow[])
      setSelected(new Set())
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // 按 group 分组
  const groups = useMemo(() => {
    const m = new Map<string, ScanRow[]>()
    for (const r of rows) {
      const list = m.get(r.group) ?? []
      list.push(r)
      m.set(r.group, list)
    }
    return m
  }, [rows])

  const toggle = (id: string): void => {
    const s = new Set(selected)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSelected(s)
  }

  const toggleAllInGroup = (group: string): void => {
    const groupIds = rows.filter((r) => r.group === group).map((r) => r.id)
    const allSelected = groupIds.every((id) => selected.has(id))
    const s = new Set(selected)
    if (allSelected) groupIds.forEach((id) => s.delete(id))
    else groupIds.forEach((id) => s.add(id))
    setSelected(s)
  }

  const applySelected = async (): Promise<void> => {
    if (selected.size === 0) return
    setBusy('apply')
    setNotice('')
    try {
      const res = (await window.api.optimizeApply([...selected])) as Array<{
        itemId: string
        ok: boolean
        errors: string[]
        needRestartExplorer?: boolean
      }>
      const ok = res.filter((r) => r.ok).length
      const fail = res.length - ok
      const need = res.some((r) => r.needRestartExplorer && r.ok)
      setNotice(t('optimize.done', { ok, fail }))
      if (need) {
        await new Promise((r) => setTimeout(r, 800))
        await window.api.optimizeRestartExplorer()
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  const undoSelected = async (): Promise<void> => {
    if (selected.size === 0) return
    setBusy('undo')
    setNotice('')
    try {
      const res = (await window.api.optimizeUndo([...selected])) as Array<{
        itemId: string
        ok: boolean
      }>
      const ok = res.filter((r) => r.ok).length
      const fail = res.length - ok
      setNotice(t('optimize.done', { ok, fail }))
      await load()
    } finally {
      setBusy(null)
    }
  }

  const undoAll = async (): Promise<void> => {
    setBusy('undo')
    setNotice('')
    try {
      await window.api.optimizeUndoAll()
      setNotice(t('optimize.done', { ok: 0, fail: 0 }) + ' (reverted all)')
      await load()
    } finally {
      setBusy(null)
    }
  }

  const rowTitle = (id: string): string => t('optimize.id.' + id)
  const rowDesc = (id: string): string => t('optimize.id.' + id + '.desc')

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('optimize.title')}</h1>
          <div className="muted small">{t('optimize.subtitle')}</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={load} disabled={busy !== null}>
            {busy === 'scan' ? t('optimize.scanning') : t('optimize.scan')}
          </button>
          <button className="btn primary" onClick={applySelected} disabled={busy !== null || selected.size === 0}>
            {busy === 'apply' ? t('optimize.applying') : t('optimize.apply')}
          </button>
          <button className="btn" onClick={undoSelected} disabled={busy !== null || selected.size === 0}>
            {t('optimize.undoSelected')}
          </button>
          <button className="btn danger" onClick={undoAll} disabled={busy !== null}>
            {t('optimize.undoAll')}
          </button>
        </div>
      </div>

      {notice && <div className="result-box">{notice}</div>}

      {[...groups.entries()].map(([group, list]) => (
        <div className="category" key={group}>
          <div className="category-title">
            <span style={{ cursor: 'pointer' }} onClick={() => toggleAllInGroup(group)}>
              {t('optimize.group.' + group)} · {list.filter((r) => selected.has(r.id)).length}/{list.length}
            </span>
          </div>
          {list.map((row) => (
            <div
              key={row.id}
              className={`item-row ${selected.has(row.id) ? 'active-row' : ''}`}
              onClick={() => toggle(row.id)}
            >
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                onChange={() => toggle(row.id)}
                onClick={(e) => e.stopPropagation()}
                style={{ marginRight: 10 }}
              />
              <div className="item-name">{rowTitle(row.id)}</div>
              <div className="item-samples grow">{rowDesc(row.id)}</div>
              {row.needRestartExplorer && (
                <span className="badge admin">{t('optimize.needRestartExplorer')}</span>
              )}
              {row.applied ? (
                <span className="badge on">已应用</span>
              ) : (
                <span className="badge off">未应用</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
