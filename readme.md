# 啄净 · Pecklean

> 免费、纯净、无广告的 Windows 清理工具

**开发者：匡形无界-啄之堂**（Kuanform Boundless · Archilau Studio）

![Electron](https://img.shields.io/badge/Electron-33-2B2E3A?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/License-个人自用-3fb950)
![Ads](https://img.shields.io/badge/广告-0-e5534b)

---

## ✨ 特性

| 模块 | 能做什么 |
|---|---|
| 🧹 **垃圾清理** | 24 条规则覆盖系统缓存、浏览器缓存、常用软件缓存与回收站，扫描后按分类勾选清理 |
| ⚡ **电脑加速** | 管理开机启动项（禁用项可随时恢复）、查看并结束占用内存的进程 |
| 🔒 **隐私清理** | 运行历史、最近文档、地址栏记录、程序使用痕迹、Chrome / Edge 浏览历史 |
| 📁 **大文件 / 重复** | 按体积找大文件，按「大小 → 头部哈希 → MD5」三级比对找重复文件 |
| 🗑️ **软件卸载** | 读取注册表中的已装软件，一键调用原生卸载程序，并扫描注册表 / 目录 / 快捷方式残留 |
| 🔀 **目录搬移** | 微信、QQ 等大目录整体搬到其他盘，原位置建立 Junction 链接，软件路径无感 |
| ⏰ **定时清理** | 注册 Windows 计划任务，每天固定时间后台静默清理，日志可查 |
| 🌐 **中英双语** | 侧边栏「中文 / EN」一键切换，文案、统计、窗口标题即时更新，选择自动记住 |

**没有**广告弹窗、付费墙、捆绑安装、常驻后台进程。

---

## 🧱 技术栈

- **Electron 33**：跨平台桌面壳，主进程负责所有系统操作
- **React 18 + TypeScript**：界面层，`contextBridge` 隔离，渲染进程无 Node 权限
- **electron-vite**：开发热更新与生产打包
- 系统能力通过 **PowerShell / robocopy / schtasks** 调用，不依赖第三方原生模块

---

## 📂 项目结构

```
surperclean/
├─ src/
│  ├─ main/                 # 主进程（系统操作全部在这里）
│  │  ├─ index.ts           # 入口；开发态开 9222 调试；--autoclean 静默模式
│  │  ├─ lang.ts            # 主进程按 lang 返回中文 / 英文消息
│  │  ├─ ipc.ts             # IPC 通道统一注册
│  │  └─ core/
│  │     ├─ utils.ts        # 大小格式化、路径展开、安全删除、PowerShell、UAC 提权、MD5
│  │     ├─ junkRules.ts    # 24 条垃圾清理规则（加规则改这里）
│  │     ├─ junk.ts         # 垃圾扫描与清理
│  │     ├─ privacy.ts      # 隐私痕迹扫描与清理
│  │     ├─ startup.ts      # 启动项、进程管理
│  │     ├─ files.ts        # 大文件、重复文件
│  │     ├─ uninstall.ts    # 软件列表、卸载、残留扫描清理
│  │     ├─ move.ts         # 目录搬移（复制 → 校验 → Junction）
│  │     └─ schedule.ts     # 定时清理配置、计划任务、静默执行
│  ├─ preload/index.ts      # contextBridge 暴露 window.api
│  ├─ renderer/src/         # 界面
│  │  ├─ App.tsx            # 布局与侧边导航
│  │  ├─ pages/             # Home / Junk / Startup / Privacy / Files / Uninstall / Move / Schedule
│  │  ├─ i18n/              # 中英词典（各 182 key）、语言上下文、主进程数据标签映射
│  │  └─ styles.css         # 暗色主题
│  └─ shared/types.ts       # 主/渲染共享类型
├─ out/                     # 构建产物
└─ debug_log_1.md           # 变更记录
```

---

## 🚀 使用说明

**一键启动**：双击项目根目录的 `启动.bat`。脚本会自动检查依赖、重新构建最新代码并打开窗口。

**命令行**

```powershell
npm install        # 首次安装依赖
npm run dev        # 开发调试（热更新）
npm run typecheck  # 类型检查
npm run build      # 构建到 out/
npm start          # 预览构建产物
```

1. 启动后左侧选择功能模块，首页卡片也可直接跳转。
2. 界面语言在侧边栏底部切换（中文 / EN），选择会保存到本地，下次启动保持。
3. **垃圾清理**：先「开始扫描」，确认列表后「一键清理」。带 `UAC` 徽章的系统项会弹出一次提权确认。
4. **软件卸载**：选中软件点「卸载」，结束后自动扫描残留；「扫描残留」可随时手动触发。
5. **目录搬移**：原目录与新位置都能点「选择」用资源管理器挑文件夹（也可直接粘贴路径）→ 选目标盘 → 点「开始搬移」，完成后原目录变成链接。
6. **定时清理**：勾选「开启定时自动清理」并保存，计划任务即写入系统；「立即运行一次」可先验证效果。

---

## 🛡️ 安全设计

- **先扫描、后勾选、再删除**，默认只选中无需管理员权限的安全缓存项
- 删除操作带根目录边界校验，任何越界路径直接跳过
- 启动项禁用不删除，备份到注册表 `SurperCleanDisabled` 键，可随时恢复
- 目录搬移三重保护：`robocopy` 复制 → 文件数与总字节逐一校验 → 校验失败自动回滚
- 卸载残留扫描会识别「软件仍处于安装状态」，此时只列出、不默认勾选，避免误删正常数据
- 浏览器历史清理会检测浏览器进程，未退出则跳过并提示
- 定时清理只执行免提权项目，不会在深夜弹出 UAC

---

## 🧩 模块职责速查

| 文件 | 关键职责 |
|---|---|
| `core/utils.ts` | 统一底层能力：`expand` / `resolveGlob` / `deletePath` / `walkFiles` / `runPowerShell`（UTF-8 输出）/ `runElevated`（UAC）/ `md5File` |
| `core/junk.ts` | 规则驱动扫描；管理员项合并成一次提权；回收站走 `Clear-RecycleBin` |
| `core/privacy.ts` | 8 类隐私痕迹；导出 `PRIVACY_IDS` 供定时清理复用 |
| `core/uninstall.ts` | 三处 Uninstall 注册表根；MSI 静默 `/x /qn`；非 MSI 调原生命令；残留按名称归一化匹配 |
| `core/move.ts` | 常用目录预设、磁盘列表、剩余空间校验、robocopy 进度、Junction 建立与回滚 |
| `core/schedule.ts` | 配置存 `userData/schedule.json`；`schtasks` 注册/删除；日志写 `autoclean.log` |

---

## 📝 备注

- 搬移或卸载前请先退出微信 / QQ / 浏览器等正在使用目标目录的程序
- 计划任务名为 `SurperClean_AutoClean`，可在「任务计划程序」中随时查看或停用
- 禁用启动项、定时清理配置、清理日志都保存在用户目录，不写入系统敏感位置

---

<p align="center">匡形无界-啄之堂（Kuanform Boundless · Archilau Studio） · 个人自用项目 · 不提供商业分发 · 使用前请自行评估风险</p>
