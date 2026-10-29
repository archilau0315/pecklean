import { useState } from 'react'
import Home from './pages/Home'
import Junk from './pages/Junk'
import Startup from './pages/Startup'
import Privacy from './pages/Privacy'
import Files from './pages/Files'
import Uninstall from './pages/Uninstall'
import Move from './pages/Move'
import Schedule from './pages/Schedule'

const NAV = [
  { key: 'home', label: '首页' },
  { key: 'junk', label: '垃圾清理' },
  { key: 'startup', label: '电脑加速' },
  { key: 'privacy', label: '隐私清理' },
  { key: 'files', label: '大文件/重复' },
  { key: 'uninstall', label: '软件卸载' },
  { key: 'move', label: '目录搬移' },
  { key: 'schedule', label: '定时清理' }
] as const

type PageKey = (typeof NAV)[number]['key']

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<PageKey>('home')
  // 页面首次访问后保持挂载，仅隐藏不卸载：扫描/搬移等长任务切走再切回可继续
  const [visited, setVisited] = useState<PageKey[]>(['home'])

  const go = (p: PageKey): void => {
    setPage(p)
    setVisited((prev) => (prev.includes(p) ? prev : [...prev, p]))
  }

  const show = (key: PageKey, node: React.JSX.Element): React.JSX.Element | null =>
    visited.includes(key) ? (
      <div className={`page-wrap${page === key ? '' : ' hidden'}`}>{node}</div>
    ) : null

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-icon">SC</span>
          <span>SurperClean</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`nav-item ${page === n.key ? 'active' : ''}`}
              onClick={() => go(n.key)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">匡形无界-啄之堂 · v1.0</div>
      </aside>
      <main className="content">
        {show('home', <Home go={go} />)}
        {show('junk', <Junk />)}
        {show('startup', <Startup />)}
        {show('privacy', <Privacy />)}
        {show('files', <Files />)}
        {show('uninstall', <Uninstall />)}
        {show('move', <Move />)}
        {show('schedule', <Schedule />)}
      </main>
    </div>
  )
}
