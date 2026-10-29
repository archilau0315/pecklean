import { useEffect, useState } from 'react'

export default function Home({
  go
}: {
  go: (p: 'junk' | 'startup' | 'privacy' | 'files' | 'uninstall' | 'move' | 'schedule') => void
}): React.JSX.Element {
  const [info, setInfo] = useState<{ version: string; electron: string } | null>(null)
  useEffect(() => {
    window.api.appInfo().then(setInfo)
  }, [])

  const cards = [
    { key: 'junk', title: '垃圾清理', desc: '临时文件、系统缓存、浏览器缓存、常用软件缓存、回收站', icon: '🧹' },
    { key: 'startup', title: '电脑加速', desc: '开机启动项管理与占用内存进程清理', icon: '⚡' },
    { key: 'privacy', title: '隐私清理', desc: '运行历史、最近文件、使用痕迹、浏览历史', icon: '🔒' },
    { key: 'files', title: '大文件/重复', desc: '找出占空间的大文件和重复文件', icon: '📁' },
    { key: 'uninstall', title: '软件卸载', desc: '卸载软件并清掉注册表、目录、快捷方式残留', icon: '🗑️' },
    { key: 'move', title: '目录搬移', desc: '微信/QQ 等大目录搬到别的盘，原路径照常可用', icon: '🔀' },
    { key: 'schedule', title: '定时清理', desc: '每天固定时间后台静默清理，无需手动', icon: '⏰' }
  ] as const

  return (
    <div className="page">
      <h1>清理中心</h1>
      <p className="muted">
        免费自用版 · 无广告 · 无付费墙 · Electron {info?.electron ?? ''}
      </p>
      <div className="card-grid">
        {cards.map((c) => (
          <button key={c.key} className="feature-card" onClick={() => go(c.key)}>
            <span className="feature-icon">{c.icon}</span>
            <span className="feature-title">{c.title}</span>
            <span className="feature-desc">{c.desc}</span>
          </button>
        ))}
      </div>
      <div className="tip-box">
        <b>安全说明</b>
        <ul>
          <li>清理前先扫描，勾选后才删除，默认只清理缓存类安全目标</li>
          <li>系统级清理（系统临时目录、预读等）会弹出 UAC 提权确认</li>
          <li>聊天记录、浏览器登录状态、文档文件不会被删除</li>
        </ul>
      </div>
      <p className="muted small">
        当前版本 {info?.version ?? '-'} · 开发者：匡形无界-啄之堂
      </p>
    </div>
  )
}
