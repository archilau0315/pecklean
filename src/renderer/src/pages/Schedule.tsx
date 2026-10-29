import { useEffect, useState } from 'react'
import { formatBytes } from './fmt'
import type { ScheduleStatus, ScheduleConfig } from '../../../shared/types'

export default function Schedule(): React.JSX.Element {
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
      const s = await window.api.scheduleSave(cfg)
      setStatus(s)
      setMsg(
        s.enabled
          ? `已开启：每天 ${s.time} 自动静默清理${s.taskExists ? '' : '（警告：计划任务创建失败）'}`
          : '已关闭定时清理'
      )
      setFailed(s.enabled && !s.taskExists)
    } catch (e) {
      setMsg(`保存失败：${(e as Error).message}`)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const runNow = async (): Promise<void> => {
    if (!confirm('立即执行一次静默清理？会删除垃圾文件与隐私记录。')) return
    setBusy(true)
    setFailed(false)
    try {
      const r = await window.api.scheduleRunNow()
      setMsg(`清理完成：${r.files} 项，释放 ${formatBytes(r.bytes)}${r.errors.length ? `，${r.errors.length} 项跳过` : ''}`)
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>定时清理</h1>
        <span className="muted small">由 Windows 计划任务在指定时间自动运行</span>
      </div>
      {msg && <div className={`result-box ${failed ? 'warn' : ''}`}>{msg}</div>}

      <div className="category">
        <div className="item-row static">
          <span className="item-name">开启定时自动清理</span>
          <span className="item-samples">每天到点后在后台静默清理，不弹窗</span>
          <span className={`badge ${enabled ? 'on' : 'off'}`}>{enabled ? '已开启' : '已关闭'}</span>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </div>

        <div className="form-row">
          <span className="form-label">每天时间</span>
          <input className="time-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>

        <label className="item-row static">
          <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
          <span className="item-name">同时清理隐私痕迹</span>
          <span className="item-samples">运行历史、最近文档、使用痕迹、浏览历史</span>
        </label>
        <label className="item-row static">
          <input type="checkbox" checked={recycleBin} onChange={(e) => setRecycleBin(e.target.checked)} />
          <span className="item-name">同时清空回收站</span>
          <span className="item-samples">回收站里的文件将被永久删除</span>
        </label>
      </div>

      <div className="tip-box">
        <b>说明</b>
        <ul>
          <li>定时清理只处理无需管理员权限的安全缓存项，系统级项目会跳过，避免半夜弹 UAC</li>
          <li>计划任务名为 SurperClean_AutoClean，可在「任务计划程序」中随时停用</li>
          <li>清理结果记录在日志里，见下方「最近记录」</li>
        </ul>
      </div>

      <div className="actions">
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? '处理中…' : '保存设置'}
        </button>
        <button className="btn" onClick={runNow} disabled={busy}>
          立即运行一次
        </button>
        <span className="spacer" />
        <span className={`badge ${status?.taskExists ? 'on' : 'off'}`}>
          计划任务{status?.taskExists ? '已注册' : '未注册'}
        </span>
      </div>

      {status?.log && (
        <div className="category">
          <div className="category-title">最近记录</div>
          <pre className="log-box">{status.log}</pre>
        </div>
      )}
    </div>
  )
}
