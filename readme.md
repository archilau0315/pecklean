# SurperClean 清理工具

免费自用的 Windows 清理工具（对标 NetpowerWinCleaner 核心功能），无广告、无付费墙。

## 项目用途

清理 Windows 垃圾文件、管理开机启动项、清理隐私痕迹、查找大文件与重复文件。

## 技术栈

Electron 33 + React 18 + TypeScript + electron-vite（开发用 `npm run dev`，构建用 `npm run build`）

## 模块清单

### 主进程（src/main）

| 模块 | 职责 |
|---|---|
| index.ts | 应用入口，创建窗口；dev 模式开启 9222 远程调试 |
| ipc.ts | IPC 通道注册，渲染进程唯一入口 |
| core/utils.ts | 大小格式化、环境变量展开、通配解析、安全删除、目录遍历、PowerShell 执行、UAC 提权、MD5 |
| core/junkRules.ts | 垃圾清理规则（24 项：临时文件/系统缓存/浏览器/常用软件），加规则改这里 |
| core/junk.ts | 垃圾扫描与清理；管理员项合并一次 UAC；回收站走 PowerShell |
| core/privacy.ts | 隐私清理：运行历史、最近文档、UserAssist、跳转列表、Chrome/Edge 历史 |
| core/startup.ts | 启动项管理（Run 注册表键 + 启动文件夹，禁用项备份到 SurperCleanDisabled 键）、进程列表与结束 |
| core/files.ts | 大文件扫描、重复文件查找（大小→头部哈希→全量 MD5）、文件删除 |

### 预加载（src/preload）

| 模块 | 职责 |
|---|---|
| index.ts | contextBridge 暴露 window.api（扫描/清理/启动项/进程/文件全部接口） |

### 渲染进程（src/renderer/src）

| 模块 | 职责 |
|---|---|
| App.tsx | 布局与导航 |
| pages/Home.tsx | 首页功能卡片 + 安全说明 |
| pages/Junk.tsx | 垃圾清理：扫描→分类结果→勾选→一键清理 |
| pages/Startup.tsx | 电脑加速：启动项启用/禁用 + 进程管理 |
| pages/Privacy.tsx | 隐私清理：扫描计数→勾选清理 |
| pages/Files.tsx | 大文件/重复文件：条件扫描→勾选删除 |
| pages/fmt.ts | 前端格式化工具 |
| styles.css | 暗色主题样式 |

### 共享（src/shared）

| 模块 | 职责 |
|---|---|
| types.ts | 主/渲染进程共享类型定义 |

## 使用说明

```powershell
npm install        # 首次安装
npm run dev        # 开发调试
npm run build      # 构建产物到 out/
npm run typecheck  # 类型检查
```

- 界面左侧导航：首页 / 垃圾清理 / 电脑加速 / 隐私清理 / 大文件·重复
- 垃圾清理默认只勾选安全缓存项；带 **UAC** 徽章的系统项清理时会弹提权确认
- 浏览器历史清理需先完全退出对应浏览器
- 禁用的启动项可在注册表 `SurperCleanDisabled` 键中找回

## 对标原版功能（v1 已实现 / 未实现）

| 功能 | 状态 |
|---|---|
| 垃圾清理（系统/浏览器/常用软件缓存、回收站） | ✅ |
| 隐私清理（MRU/跳转列表/浏览历史） | ✅ |
| 启动项管理 + 进程清理 | ✅ |
| 大文件 / 重复文件 | ✅ |
| 软件卸载与残留、目录搬移、弹窗拦截、定时清理、加速球 | 未实现（后续迭代） |
| 广告、付费墙、全家桶推广 | 永远不会实现 😄 |
