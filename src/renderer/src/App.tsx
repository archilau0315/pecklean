import { useState } from 'react'
import Home from './pages/Home'
import Junk from './pages/Junk'
import Startup from './pages/Startup'
import Privacy from './pages/Privacy'
import Files from './pages/Files'

const NAV = [
  { key: 'home', label: '首页' },
  { key: 'junk', label: '垃圾清理' },
  { key: 'startup', label: '电脑加速' },
  { key: 'privacy', label: '隐私清理' },
  { key: 'files', label: '大文件/重复' }
] as const

type PageKey = (typeof NAV)[number]['key']

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<PageKey>('home')
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
              onClick={() => setPage(n.key)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">免费自用版 v1.0</div>
      </aside>
      <main className="content">
        {page === 'home' && <Home go={setPage} />}
        {page === 'junk' && <Junk />}
        {page === 'startup' && <Startup />}
        {page === 'privacy' && <Privacy />}
        {page === 'files' && <Files />}
      </main>
    </div>
  )
}
