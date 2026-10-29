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
