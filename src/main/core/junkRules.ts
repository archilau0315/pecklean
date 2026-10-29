/** 垃圾清理规则（常用软件与系统缓存的安全子集）
 * pattern 支持 %ENV% 与 * 通配；admin=true 的项通过 UAC 提权清理
 */
export interface JunkRule {
  id: string
  name: string
  category: string
  /** 要清空内容的目录（通配），删除其中文件而不是目录本身 */
  targets: string[]
  admin?: boolean
  desc?: string
}

export const JUNK_RULES: JunkRule[] = [
  // ── 临时文件 ──────────────────────────────────────────────
  {
    id: 'temp-user',
    name: '用户临时文件',
    category: '临时文件',
    targets: ['%TEMP%']
  },
  {
    id: 'temp-system',
    name: '系统临时文件',
    category: '临时文件',
    admin: true,
    targets: ['%SystemRoot%\\Temp']
  },
  {
    id: 'prefetch',
    name: 'Windows 预读缓存',
    category: '临时文件',
    admin: true,
    targets: ['%SystemRoot%\\Prefetch'],
    desc: '清空后首次启动软件可能略慢，之后自动重建'
  },
  {
    id: 'recent',
    name: '最近打开文件记录',
    category: '临时文件',
    targets: ['%APPDATA%\\Microsoft\\Windows\\Recent']
  },
  {
    id: 'jumplists',
    name: 'Windows 跳转列表',
    category: '临时文件',
    targets: [
      '%APPDATA%\\Microsoft\\Windows\\Recent\\AutomaticDestinations',
      '%APPDATA%\\Microsoft\\Windows\\Recent\\CustomDestinations'
    ]
  },

  // ── 系统缓存 ──────────────────────────────────────────────
  {
    id: 'thumbnail',
    name: '缩略图缓存',
    category: '系统缓存',
    targets: ['%LOCALAPPDATA%\\Microsoft\\Windows\\Explorer\\thumbcache_*.db']
  },
  {
    id: 'shader-d3d',
    name: 'DirectX 着色器缓存',
    category: '系统缓存',
    targets: ['%LOCALAPPDATA%\\D3DSCache']
  },
  {
    id: 'shader-nv',
    name: '显卡着色器缓存',
    category: '系统缓存',
    targets: ['%LOCALAPPDATA%\\NVIDIA\\DXCache', '%LOCALAPPDATA%\\NVIDIA\\GLCache', '%LOCALAPPDATA%\\AMD\\DxCache', '%LOCALAPPDATA%\\AMD\\GLCache']
  },
  {
    id: 'wer',
    name: '错误报告缓存',
    category: '系统缓存',
    targets: [
      '%LOCALAPPDATA%\\Microsoft\\Windows\\WER\\ReportArchive',
      '%LOCALAPPDATA%\\Microsoft\\Windows\\WER\\ReportQueue',
      '%ProgramData%\\Microsoft\\Windows\\WER\\ReportArchive',
      '%ProgramData%\\Microsoft\\Windows\\WER\\ReportQueue'
    ]
  },
  {
    id: 'inetcache',
    name: '系统网络缓存',
    category: '系统缓存',
    targets: ['%LOCALAPPDATA%\\Microsoft\\Windows\\INetCache']
  },
  {
    id: 'deliveryopt',
    name: 'Windows 更新传递优化文件',
    category: '系统缓存',
    admin: true,
    targets: ['%SystemRoot%\\SoftwareDistribution\\DeliveryOptimization']
  },
  {
    id: 'dump',
    name: '内存转储文件',
    category: '系统缓存',
    admin: true,
    targets: ['%SystemRoot%\\Minidump', '%SystemRoot%\\MEMORY.DMP']
  },

  // ── 浏览器 ────────────────────────────────────────────────
  {
    id: 'chrome-cache',
    name: 'Chrome 浏览器缓存',
    category: '浏览器',
    targets: [
      '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\*\\Cache\\Cache_Data',
      '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\*\\Code Cache',
      '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\*\\GPUCache',
      '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\*\\Service Worker\\CacheStorage',
      '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\*\\Service Worker\\ScriptCache'
    ],
    desc: '仅清缓存，不动历史记录和登录状态'
  },
  {
    id: 'edge-cache',
    name: 'Edge 浏览器缓存',
    category: '浏览器',
    targets: [
      '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\*\\Cache\\Cache_Data',
      '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\*\\Code Cache',
      '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\*\\GPUCache',
      '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\*\\Service Worker\\CacheStorage',
      '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\*\\Service Worker\\ScriptCache'
    ]
  },

  // ── 常用软件专清 ──────────────────────────────────────────
  {
    id: 'wps',
    name: 'WPS Office 缓存/日志',
    category: '常用软件',
    targets: [
      '%APPDATA%\\kingsoft\\office6\\log',
      '%LOCALAPPDATA%\\Kingsoft\\WPS Office\\log',
      '%LOCALAPPDATA%\\Kingsoft\\wps\\log'
    ]
  },
  {
    id: 'qq',
    name: 'QQ 缓存/日志',
    category: '常用软件',
    targets: ['%APPDATA%\\Tencent\\Logs', '%APPDATA%\\Tencent\\QQ\\Temp']
  },
  {
    id: 'wechat',
    name: '微信图片视频缓存',
    category: '常用软件',
    targets: [
      '%APPDATA%\\Tencent\\WeChat\\WeChat Files\\*\\FileStorage\\Cache',
      '%APPDATA%\\Tencent\\WeChat\\WeChat Files\\All Users\\Cache'
    ],
    desc: '只清缓存目录，聊天记录与文件不删'
  },
  {
    id: 'netdisk',
    name: '百度网盘日志',
    category: '常用软件',
    targets: ['%APPDATA%\\BaiduNetdisk\\users\\*\\logs', '%LOCALAPPDATA%\\BaiduNetdisk\\log']
  },
  {
    id: 'cloudmusic',
    name: '网易云音乐缓存',
    category: '常用软件',
    targets: ['%LOCALAPPDATA%\\Netease\\CloudMusic\\.Cache', '%LOCALAPPDATA%\\Netease\\CloudMusic\\Cache']
  },
  {
    id: 'kugou',
    name: '酷狗音乐缓存',
    category: '常用软件',
    targets: ['%APPDATA%\\KuGou8\\cache', '%LOCALAPPDATA%\\KuGou\\cache']
  },
  {
    id: 'tencent-video',
    name: '腾讯视频缓存',
    category: '常用软件',
    targets: ['%APPDATA%\\Tencent\\Video\\Video_Data\\Cache', '%LOCALAPPDATA%\\Tencent\\Video\\Cache']
  },
  {
    id: 'iqiyi',
    name: '爱奇艺缓存',
    category: '常用软件',
    targets: ['%APPDATA%\\IQIYI Video\\Cache', '%LOCALAPPDATA%\\iqiyi\\Cache']
  },
  {
    id: 'vscode',
    name: 'VS Code 缓存',
    category: '常用软件',
    targets: [
      '%APPDATA%\\Code\\Cache',
      '%APPDATA%\\Code\\CachedData',
      '%APPDATA%\\Code\\Code Cache',
      '%APPDATA%\\Code\\GPUCache'
    ]
  }
]
