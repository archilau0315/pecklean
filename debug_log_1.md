# Debug Log

## 1

- 时间：2026-10-29 14:40
- 模块：全部（项目初始化）
- 变更简述：梳理清理工具功能清单与扫描项，搭建 Electron+React+TS 项目；实现垃圾清理（24 规则）、隐私清理（8 项）、启动项/进程管理、大文件/重复文件四大引擎 + 四个页面 + IPC；typecheck/build 通过，CDP 端到端验证四页面（扫描出 15.5GB 垃圾、真实进程列表、隐私计数、大文件列表均正常）
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

## 4

- 时间：2026-10-29 16:40
- 模块：readme.md、package.json、pages/Home.tsx、App.tsx、core/junkRules.ts、core/files.ts、core/privacy.ts、debug_log_1.md
- 变更简述：移除所有「对标 NetpowerWinCleaner / 原软件」表述；补充开发者信息「匡形无界-啄之堂」（首页版本行、侧边栏底部、readme 标题下与页脚、package.json author）
- 备注：无

## 5

- 时间：2026-10-29 17:05
- 模块：App.tsx、styles.css
- 变更简述：长任务跨页面保持。页面首次访问后保持挂载，只隐藏不卸载（`.page-wrap.hidden`），扫描、搬移、卸载等耗时操作切到其他页面再切回来仍在继续，进度与结果不丢
- 备注：CDP 实测「垃圾清理扫描中 → 电脑加速 → 隐私清理 → 定时清理 → 切回」，进度由 14/24 连续推进到 15/24 并最终完成，结果列表正常保留；已访问页面越多内存占用略增，但可忽略

## 6

- 时间：2026-10-29 17:15
- 模块：启动.bat、readme.md
- 变更简述：新增一键启动脚本。双击后自动检查 Node 环境、缺少依赖则 npm install、每次重新构建最新代码，再以生产模式启动 Electron，无需记命令
- 备注：已实测双击后窗口正常打开（标题 SurperClean 清理工具）；关闭窗口即退出

## 7

- 时间：2026-10-29 17:30
- 模块：ipc.ts、preload/index.ts、api.d.ts、pages/Move.tsx、readme.md
- 变更简述：目录搬移支持资源管理器选目录。新增 `dialog:pickFolder` IPC（系统文件夹选择框，可新建文件夹），原目录与新位置各加一个「选择」按钮；手动选定的目标位置不再被「目标盘」自动覆盖，目录大小显示改为独立于目标位置计算
- 备注：typecheck/build 通过；开发态 CDP 确认两个按钮渲染正常、pickFolder 已暴露

## 8

- 时间：2026-10-29 18:05
- 模块：i18n/*、App.tsx、pages/*、styles.css、ipc.ts、preload/index.ts、api.d.ts、shared/types.ts、core/{startup,uninstall,move,schedule,junk}.ts、main/lang.ts
- 变更简述：新增中英双语。渲染层用自写 i18n（LanguageProvider + useI18n + t，localStorage 记忆），中英各 182 key；8 个页面全部文案走翻译；侧边栏「中文 / EN」即时切换并同步窗口标题；主进程返回的规则名、分类、隐私项、预设、残留类型按 id/kind 在渲染层翻译，缺失回退原文；启动项/卸载/搬移/定时清理的结果消息与进度文案由主进程按传入 lang 返回中英双语
- 备注：typecheck/build 通过；CDP 实测中→英→中切换，导航、首页、垃圾清理、定时清理文案与窗口标题均正确切换，语言选择可持久化；未翻译项：软件名/进程名/注册表名称等原始数据、旧清理日志、浏览器未关闭等错误详情

## 9

- 时间：2026-10-29 19:10
- 模块：core/uninstall.ts、pages/Uninstall.tsx、api.d.ts
- 变更简述：修复卸载卡住。厂商交互式卸载程序（如 Archicad 的 Uninstall.exe）改为只启动、不等待，不再让界面长期停在「卸载中」；返回 `interactive` 标记，界面跳过自动残留扫描，改为提示用户完成向导后手动点「扫描残留」；MSI 软件仍静默卸载并等待结果
- 备注：问题现象为 Archicad 27 卸载时进度无响应（卸载向导是交互式流程，原实现 -Wait 会一直阻塞到向导退出）；检测到本地无残留的 Uninstall.exe 进程，安装目录仅被部分删除；typecheck/build 通过

## 10

- 时间：2026-10-29 19:20
- 模块：i18n/en.ts、readme.md
- 变更简述：补充开发者英文名。英文界面侧边栏与首页版本行改为 Kuanform Boundless · Archilau Studio，readme 标题区与页脚同步标注中英名称
- 备注：中文界面保持「匡形无界-啄之堂」不变

## 11

- 时间：2026-10-29 19:45
- 模块：core/uninstall.ts
- 变更简述：修复点击卸载后不弹窗口。原实现把 UninstallString 整串交给 `cmd /c` 执行，路径含空格且未加引号时（如 `D:\Program Files\NetPowerCleaner\NetpowerWinCleaner\uninst.exe`）cmd 把 `D:\Program` 当命令而直接报错退出；改为先拆分出 exe 路径与参数，再用 Start-Process 提权直接启动，路径不存在时给出明确提示
- 备注：新增 parseCommand 支持带引号路径和含空格未加引号路径；typecheck/build 通过

## 12

- 时间：2026-10-29 20:05
- 模块：core/junk.ts
- 变更简述：修复回收站清不掉。原实现用 `Clear-RecycleBin`，本机回收站有 153 万文件/89 GB，该命令长时间不返回，被 60 秒超时判失败；改为直接操作 `$Recycle.Bin\<当前用户 SID>`：用 PowerShell 递归统计大小、逐项 `Remove-Item` 删除，残留再走提权删除；扫描改为磁盘目录统计并与规则扫描并行，避免 COM 枚举卡死
- 备注：超时提高到 600 秒；仍被占用的项目会提示「重启后再清理」；typecheck/build 通过

## 13

- 时间：2026-10-29 21:10
- 模块：pages/Files.tsx、core/privacy.ts、core/startup.ts、i18n
- 变更简述：大文件支持逐条勾选 + 全选/取消全选 + 批量删除；重复文件去掉强制「建议保留」锁，每条都可勾选，并加「选中本组/取消本组」；隐私清理重写注册表删除命令（原 UserAssist 命令拼接非法、FeatureUsage 只删值不删子键、错误被 SilentlyContinue 吞掉），改为值/子键分别清理并显式报错；启动项修复启动文件夹项因大小写判断导致无法启停、禁用项从列表消失、Wow6432Node 禁用项读不回来；结束进程改用 taskkill /F /T 并回传失败原因
- 备注：已在真实环境验证注册表删除、启动项禁用/启用、taskkill 均生效；测试用注册表项与进程已清理

## 14

- 时间：2026-10-29 21:40
- 模块：App.tsx、i18n/zh.ts、i18n/en.ts、main/index.ts、renderer/index.html、启动.bat、package.json、readme.md
- 变更简述：应用更名「啄净 / Pecklean」：侧边栏 logo 与品牌名、窗口标题、页面 title、启动脚本、包描述、readme 标题同步更新；新增 app.name 双语键供界面读取
- 备注：内部标识同步改为 Pecklean：启动项备份键 PeckleanDisabled、文件夹禁用后缀 .pecklean-disabled、计划任务 Pecklean_AutoClean、搬移默认目录 PeckleanMove、提权临时脚本 pecklean-admin-*.ps1；已确认本机没有旧的 SurperClean 备份键/禁用项/计划任务/搬移目录，改名不会造成失联

## 15

- 时间：2026-10-29 22:35
- 模块：项目根目录、package.json、package-lock.json、readme.md
- 变更简述：项目目录从 surperclean 改为 pecklean，包名同步改为 pecklean，readme 目录树同步；Git 仓库随目录迁移，历史提交完整保留
- 备注：旧目录被当前编辑器进程占用无法直接改名，改用 robocopy 全量迁移（含 .git、node_modules），新旧目录内容一致；确认新目录 typecheck/build 通过后启动验证

## 16

- 时间：2026-10-30
- 模块：启动.bat、package.json、readme.md、src/renderer/src/i18n/zh.ts、src/main/index.ts、src/renderer/index.html
- 变更简述：应用中文名「啄净」改为「啄·净」，中间加间隔号，同步更新窗口标题、页面 title、启动脚本、包描述、readme 标题、中文词典 app.name/app.title
- 备注：仅改显示用中文名，包名 pecklean、计划任务名等内部标识不变；debug_log 历史记录中的「啄净」保留不改

## 17

- 时间：2026-10-30 08:37
- 模块：core/utils.ts、core/junk.ts
- 变更简述：①修复垃圾扫描/清理只认回收站的根因：`resolveGlob` 从空字符串开始逐段 `path.join`，而 Electron 33（Node 20）的 `path.join('', 'C:')` 返回 `C:.`，后续被拼成 `C:Users…` 这类相对盘符路径，所有规则路径都判定不存在，只统计到回收站；改为把盘符单独作为起点 `C:\`，其余路径段再拼接。②回收站统计改用 `robocopy /L /E /BYTES` 列表模式，按汇总表「目录 / 文件 / 字节」的固定行序取数字（不依赖中英文标签），原 PowerShell 逐文件枚举保留为兜底；本机 36.5 万文件 / 119 GB 回收站统计由 25.2 秒降到 1.3 秒，整体扫描 24.5 秒降到 1.3 秒。
- 备注：robocopy 汇总文案随系统语言变化（中文为「目录/文件/字节」），因此按行结构解析而非匹配英文关键字；`/BYTES` 输出精确字节；扫描后在 Electron 内置 Node 下实测，各规则恢复正常计数（临时文件 300 个、Edge 缓存 292 个、WPS 日志 6 个等），单条规则清理实测正常（D3D 缓存 4 个文件 17 ms）。

## 18

- 时间：2026-10-30 09:03
- 模块：main/core/junk.ts、main/ipc.ts、preload/index.ts、renderer/src/api.d.ts、renderer/src/pages/Junk.tsx、renderer/src/i18n/zh.ts、renderer/src/i18n/en.ts、shared/types.ts
- 变更简述：垃圾清理过程增加实时进度。主进程按「逐条规则 → 管理员提权 → 回收站」分步推送 `junk:clean-progress`，回收站步骤附带待清理文件数与总体积；界面显示「当前项 (n/总数) · 已用 xx 秒」，清理结束后自动退订并停表。
- 备注：本机回收站约 36.5 万个文件 / 119 GB，按默认勾选执行「一键清理」时，真正删除 119 GB 数据受磁盘速度限制仍需较长时间，此前界面无任何反馈，看起来像卡住；现在能看到正在清哪一项、回收站有多少待删项以及计时。清理逻辑本身未改动。

## 19

- 时间：2026-10-30 09:12
- 模块：core/junk.ts
- 变更简述：清空回收站所用的 robocopy `/MIR` 增加 `/MT:16`，多线程删除大量小文件，缩短长时间清不动的情况。
- 备注：现场观察时应用正在用旧版本以单线程 robocopy 删除回收站 36.5 万项 / 119 GB，已跑 10 分钟以上仍未结束，磁盘被占满导致整机卡顿；该参数按 robocopy 官方说明用于提升多文件复制/删除吞吐，本次因清理正在进行未能做前后对比实测，需重启应用后生效。

## 20

- 时间：2026-10-30 09:30
- 模块：core/move.ts、core/files.ts、ipc.ts、preload/index.ts、api.d.ts、pages/Move.tsx、pages/Files.tsx、i18n/zh.ts、i18n/en.ts、readme.md
- 变更简述：①重复文件搜索支持三种范围（全盘全量 / 指定磁盘 / 指定文件夹），后端 `findDuplicates` 改为接收 `roots: string[]`，新增 `normalizeRoots` 处理盘符、去重、剔除被其它根目录包含的路径，避免同一文件被重复计入；界面改为模式切换 + 磁盘多选 + 文件夹列表增删，并显示本次扫描范围。②修复目录搬移误报「目标位置已存在同名文件夹」：选择框返回的已存在目录按「存放位置」处理，实际目标为 `存放位置\源目录名`，仅当该同名子目录已有内容才报冲突；同名空目录可直接放入；目标是文件、目标等于源、目标在源内部均给出对应提示；界面增加「实际存放位置」预览与确认内容同步。③Junction 创建改为普通权限优先、提权兜底，不再每次弹 UAC；备份目录删除改用 `[System.IO.Directory]::Delete`；robocopy 去掉 `/NP` 恢复复制进度。④磁盘列表改用 CIM 只取本地固定磁盘，排除网络盘/光驱，避免全盘扫描拖垮网络共享。
- 备注：临时 harness（esbuild 打包后在 Electron Node 下运行）覆盖 36 项断言全部通过：跨盘/同盘/嵌套/同名空目录/60MB 大目录搬移成功且源路径变链接、无备份残留；同名非空冲突、目标为文件、目标等于源、目标在源内部均正确拒绝且源数据未受影响；指定文件夹搜索、重叠根去重、同大小不同内容不误判、进度回调正常；网络盘已排除。typecheck、build 通过，需重启应用生效。

## 21

- 时间：2026-10-30 09:59
- 模块：core/utils.ts、core/junk.ts、ipc.ts、preload/index.ts、api.d.ts、pages/Junk.tsx、i18n/zh.ts、i18n/en.ts、readme.md
- 变更简述：垃圾清理的扫描与清理支持中途取消。主进程为每次任务建立可取消状态（cancelled 标记 + 子进程集合），`cancelJunk()` 置位并终止正在运行的 robocopy / PowerShell 子进程；扫描规则、逐文件统计、目录删除循环、回收站统计与镜像删除均加入中断检查，取消后返回空扫描结果或已完成的清理统计，并推送 `cancelled` 进度。界面在任务执行时把「开始扫描 / 一键清理」按钮切换为「取消扫描 / 取消清理」，点击即取消，完成后提示已取消；取消清理时保留列表便于再次处理。
- 备注：harness 9 项断言全部通过：扫描取消命中、7ms 内结束、返回空结果、产生 cancelled 进度、任务状态释放、取消后可再次启动；deletePath 未开始取消不删文件、中途取消保留剩余文件。typecheck、build 通过，需重启应用生效。提权步骤（UAC 弹窗阶段）无法强杀，取消会在该步骤结束后生效。

## 22

- 时间：2026-10-30 10:10
- 模块：package.json、build/icon.png、readme.md
- 变更简述：新增 electron-builder 打包能力，产物为免安装单文件 `dist\Pecklean-1.0.0-x64.exe`（约 77 MB，x64，portable 目标，asInvoker 普通权限启动）。打包配置写入 package.json 的 build 字段，新增 `npm run dist` 命令；新增 256×256 应用图标 build/icon.png；readme 增加交付版使用说明（自解压耗时、未签名时的 SmartScreen 提示、重新打包命令）。
- 备注：打包过程使用本机 Electron 33.4.11 缓存，仅下载 NSIS/7zip/图标包；未配置代码签名，安装包与主程序均跳过签名。真实启动冒烟测试通过：便携 exe 约 6 秒完成自解压并拉起 5 个进程，窗口标题正常显示 Pecklean，随后已全部结束。dist/ 已在 .gitignore 中，打包产物不入库。

## 23

- 时间：2026-10-30 10:41
- 模块：renderer/src/App.tsx、renderer/src/styles.css
- 变更简述：侧边栏品牌图标由「啄」文字改为内联 SVG 啄木鸟侧面头像剪影（细长喙、头顶羽冠、圆形眼睛镂空），白色剪影尽量撑满图标；底色改为与应用图标一致的墨绿→青绿渐变（#00895F → #03BE9F），图标尺寸 30→32px。SVG 使用 mask 做眼睛镂空，无需额外图片资源。
- 备注：用 Electron 离屏截图渲染 128/64/32px 三档核对造型与识别度，32px 下仍可辨认；typecheck、build 通过，并已重新打包 dist\Pecklean-1.0.0-x64.exe（77 MB，10:41 更新）。













## 24

- 时间：2026-10-30 10:55
- 模块：renderer/src/assets/logo.png、build/icon.png、renderer/src/App.tsx、renderer/src/styles.css、renderer/src/images.d.ts
- 变更简述：侧栏 logo 改回「图片剪影」方案并放大到 40px（object-fit: cover，圆角 10px）。重新制作干净的啄木鸟侧面头像素材：白色剪影尽可能撑满方形，底色为墨绿→青绿对角渐变，四边满铺无留白；同源导出 build/icon.png（256×256），保证侧栏 logo 与任务栏/桌面图标是同一张图。废除上一版内联 SVG，恢复 *.png 模块声明。
- 备注：原 assets/logo.png 与 build/icon.png 左侧存在一条 16% 宽的白色竖带（生成图残留），喙部被白带吞掉；已重绘并裁掉右下角生成水印。Electron 离屏截图（1280×800，stub preload）核对侧栏实际显示，造型清晰、无白边；typecheck、build 通过，正在重新打包 exe。

## 25

- 时间：2026-10-30 11:22
- 模块：renderer/src/assets/logo.png、build/icon.png
- 变更简述：啄木鸟剪影头部新增圆形眼睛镂空，洞体透出墨绿→青绿渐变底色，40px（侧栏）清晰可辨，32px 仍能看出绿点。同步修复 package.json 开头双 UTF-8 BOM（EF BB BF ×2）导致的 JSON 解析失败——读取时去除多余 U+FEFF，无 BOM 写回。
- 备注：离屏截图（40/32/24px 三档缩略图 + 5× 放大）核对眼睛识别度，32px 以上无压力。typecheck、build 通过。

## 26

- 时间：2026-10-30 11:40
- 模块：src/renderer/src/assets/logo.png、build/icon.png、build/icon.ico、package.json
- 变更简述：啄木鸟眼睛绿色圆（质心 302,208，半径 ≈ 32）内添加白色小圆点高光，位置从眼睛中心向左上偏移约 0.36r（高光 r ≈ 8）。同时导出 build/icon.ico（多尺寸 16/32/48/64/128/256），并将 package.json 的 build.win.icon 从 png 改为 ico，使最终 exe 真正带上多尺寸啄木鸟图标（资源管理器、任务栏、Alt+Tab 均正确显示）。眼睛定位用 Python + PIL + numpy 连通域分析：G-R > 30 且 G-B > 20 的像素标记为绿色，BFS 求连通域，筛选面积 500-6000、质心 y < 70% 画布、bbox 接近正方形的块——即眼窝。
- 备注：32/24px 缩略图肉眼验证高光可见；typecheck、build 通过。上一轮脚本 HSV 转 hue 公式 else 分支写错导致失败，本次改用 RGB 差值 + 连通域，稳健。

## 27

- 时间：2026-10-30 12:05
- 模块：readme.md、仓库配置
- 变更简述：readme 全面重做视觉版——居中 logo 头图、徽章行、目录锚点、三大特性卡片表格、与常见清理软件的对比表、Mermaid 架构图、快速开始、模块操作要点表、安全设计、项目结构树、模块职责表、可折叠 FAQ、路线图。同时创建 GitHub 仓库 archilau0315/pecklean 并推送全部提交。
- 备注：仓库 public，首个推送分支 master 成为默认分支；dist/ 与 out/ 已被 .gitignore 排除，未上传打包产物。

## 28

- 时间：2026-10-30 12:20
- 模块：readme.md、readme.en.md
- 变更简述：readme 改为双语——readme.md 顶部加「简体中文 · English」切换，新增 readme.en.md 完整英文版（特性卡片、竞品对比、架构图、快速开始、用法表、安全设计、结构树、FAQ、路线图全部对译）。
- 备注：两版互相链接；GitHub 默认展示中文版。

## 29

- 时间：2026-10-30 12:40
- 模块：GitHub Release、readme.md、readme.en.md
- 变更简述：exe 不走仓库提交（77MB 会永久膨胀 git 历史），改为上传 GitHub Release 资产 v1.0.0，直链 https://github.com/archilau0315/pecklean/releases/download/v1.0.0/Pecklean-1.0.0-x64.exe。两个 readme 顶部加醒目的「下载免安装版」按钮（for-the-badge 徽章指向 releases/latest），快速开始改为直接下载并附 SHA-256 校验值。
- 备注：SHA-256 1436283871B90D5D3415CE5A588C480BE9B6A48212E73E9D777F741613283A53；资产大小 77.1MB；Release 说明含中英双语与 SmartScreen 提示。

## 30

- 时间：2026-10-30 12:55
- 模块：readme.md、readme.en.md（删除）
- 变更简述：把中英双语合并进单个 readme.md。顶部保留 logo、双语标语、徽章与下载按钮，下方「简体中文 · English」锚点互跳；正文分「## 中文」「## English」两大块，各自带独立目录锚点，中文仍在最前作为默认阅读区。删除 readme.en.md。
- 备注：合并后小节层级下沉一级（## 变 ###、### 变 ####），并同步修正英文目录锚点（GitHub 会把 emoji 前缀计入 slug，实际为 #-features 而非 #features）。

## 31

- 时间：2026-10-30 13:10
- 模块：build/cover.png、build/cover_philosophy.md、readme.md
- 变更简述：按「Chroma Arbor」设计哲学用 PIL 生成 README 封面图——1600×900，深海军蓝底 (#0f1420) 加径向青绿渐变光晕、60px 网格、随机分布的啄点装饰；左侧啄木鸟 icon 置于青绿渐变圆形光晕与细环内；右侧「啄 · 净」用墨绿→青绿横向渐变填充 + glow mask、「Pecklean」纯白、中英双语标语、渐变分割线、6 项功能清单（绿圆点 + 中英双语名）、5 枚技术徽章（Portable 用深色底反衬）、底部元数据栏（GitHub 仓库 + Free·Clean·No Ads·Portable·Fully Local 标语）、左上 ARCHILAU STUDIO 标识。Cover 已嵌进 readme 顶部。
- 备注：PIL 	extbbox 测中文；gradient 文字用 mask 合成；光晕用 GaussianBlur 叠加；msyhbd.ttc / arialbd.ttf 分别做中英粗体。

## 32

- 时间：2026-10-30 13:25
- 模块：build/cover.png、readme.md、remote gitee
- 变更简述：封面图 v2 把底部元数据条改为双镜像显示——左：GitHub · 国际主仓（github.com/archilau0315/pecklean），右：Gitee · 国内镜像（gitee.com/archilau0315/pecklean），中央 Free·Clean·No Ads·Portable·Fully Local 标语。中英双语 readme 的「快速开始」新增镜像对比表。git remote 添加 gitee 指向 https://gitee.com/archilau0315/pecklean.git（仓库需用户手动在 Gitee 网页端创建，因本地凭据是密码而非 access_token 且 SSH key 未绑定 Gitee）。
- 备注：Gitee 凭据 username=archilau password_len=10，与 GitHub username archilau0315 不匹配；SSH git@gitee.com Permission denied (publickey)。用户在 Gitee 建好仓库后跑 git push gitee master 即可同步。

## 33

- 时间：2026-10-30 13:35
- 模块：build/cover.png、readme.md、git remote gitee
- 变更简述：修正 Gitee 用户名——仓库地址实际是 gitee.com/archilau/pecklean（archilau 而非 archilau0315）。封面图底部条 Gitee 链接更新为正确用户名；git remote set-url gitee https://gitee.com/archilau/pecklean.git；readme 中 Gitee 镜像链接同步修正。用户确认仓库已在 Gitee 同步推送，commit SHA 9c077d8 匹配。
- 备注：Gitee Release 附件上传需要 access_token（用户在 gitee.com 设置 → 私人令牌生成），当前凭据是账号密码 100422Lyf# 不是 token；用户需手动去 Release 页面上传 exe 或提供 token 让我代传。

## 34

- 时间：2026-10-30 13:45
- 模块：build/cover.png
- 变更简述：封面图 v7 修复右侧贴边问题——把右内容块起始位置从 640 左移到 560，ICON_CX=290/halo_r=200/画布 1600×900/右侧安全边距 MARGIN_R=80 (RIGHT_LIMIT=1520)。功能两列总宽 617px，可用空间 960px，完全放得下。徽章行最后一项终止于 RIGHT_LIMIT-溢出保护。啄·净字号降为 96，Pecklean 降为 64，字幕降为 24/19，功能项降为 18/17，整体更紧凑。
- 备注：啄·净 两个字分两次 mask 合成并在中间画一个独立的渐变圆点，避免单字符串带间隔点的 mask 位移 bug。
