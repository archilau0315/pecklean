# Debug Log

## 1

- 时间：2026-10-29 14:40
- 模块：全部（项目初始化）
- 变更简述：逆向 NetpowerWinCleaner（WinCleaner.dll v8.8.5）得到功能清单与扫描项，搭建 Electron+React+TS 项目；实现垃圾清理（24 规则）、隐私清理（8 项）、启动项/进程管理、大文件/重复文件四大引擎 + 四个页面 + IPC；typecheck/build 通过，CDP 端到端验证四页面（扫描出 15.5GB 垃圾、真实进程列表、隐私计数、大文件列表均正常）
- 备注：管理员清理项走 Start-Process -Verb RunAs；禁用启动项备份到 SurperCleanDisabled 注册表键；浏览器历史需浏览器退出后清理

## 2

- 时间：2026-10-29 14:45
- 模块：core/junk.ts、pages/Home.tsx
- 变更简述：修复扫描结果样本列误显「未发现」（目录型规则未记录样本路径）；移除首页多余的「0 B」文案
- 备注：无

## 3

- 时间：2026-10-29 16:20
- 模块：core/uninstall.ts、core/move.ts、core/schedule.ts、core/utils.ts、main/index.ts、ipc.ts、preload/index.ts、shared/types.ts、pages/Uninstall.tsx、pages/Move.tsx、pages/Schedule.tsx、App.tsx、pages/Home.tsx、styles.css、readme.md
- 变更简述：新增三大功能。①软件卸载与残留清理：读 HKLM/HKCU 三处 Uninstall 键列出 176 个软件，MSI 走 `/x /qn` 静默卸载、其余调原生命令并提权；残留按注册表键 + 安装/数据目录 + 开始菜单快捷方式三类扫描，软件仍在安装时只列出不默认勾选。②目录搬移：robocopy 复制带进度 → 文件数/字节数校验 → 提权建 Junction，失败自动回滚，支持微信/QQ/企业微信/钉钉预设与磁盘余量检查。③定时清理：配置存 userData/schedule.json，用 schtasks 注册每日任务，`--autoclean` 参数分支静默清理后退出并写日志。另修复 PowerShell 输出中文乱码（强制 UTF-8 输出）与提权脚本中文路径乱码（UTF-8 BOM）
- 备注：计划任务创建/删除、残留扫描报告、三页面渲染均已通过 CDP 端到端验证；搬移的真实 Junction 步骤需 UAC 授权，未在自动化中执行（逻辑已按「校验失败即回滚」实现）

