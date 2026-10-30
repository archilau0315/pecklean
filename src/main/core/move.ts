/** 目录搬移：robocopy 复制 → 校验 → 建 junction 链接（原目录仍可正常访问） */
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { deletePath, expand, runElevated, runPowerShell, walkFiles, formatBytes } from './utils'
import { pick } from '../lang'
import { MovePreset, MoveProgress, MoveResult, Lang } from '../../shared/types'

const PRESETS: { id: string; name: string; path: string }[] = [
  { id: 'wechat', name: '微信聊天记录', path: path.join(os.homedir(), 'Documents', 'WeChat Files') },
  { id: 'wechat4', name: '微信 4.0 数据', path: path.join(os.homedir(), 'Documents', 'xwechat_files') },
  { id: 'qq', name: 'QQ 文件与记录', path: path.join(os.homedir(), 'Documents', 'Tencent Files') },
  { id: 'wxwork', name: '企业微信数据', path: path.join(os.homedir(), 'Documents', 'WXWork') },
  { id: 'dingtalk', name: '钉钉接收文件', path: path.join(os.homedir(), 'Documents', 'DingTalk') }
]

/** 列出常见的可搬移目录（存在的才返回占用大小） */
export async function listPresets(): Promise<MovePreset[]> {
  const out: MovePreset[] = []
  for (const p of PRESETS) {
    const abs = expand(p.path)
    if (!existsSync(abs)) continue
    out.push({ id: p.id, name: p.name, path: abs, exists: true, bytes: await measure(abs) })
  }
  return out
}

/** 统计目录大小（字节） */
export async function dirSize(dir: string): Promise<number> {
  return measure(dir)
}

async function measure(dir: string): Promise<number> {
  let bytes = 0
  await walkFiles(dir, (_f, size) => {
    bytes += size
  })
  return bytes
}

async function countFiles(dir: string): Promise<{ files: number; bytes: number }> {
  const st = { files: 0, bytes: 0 }
  await walkFiles(dir, (_f, size) => {
    st.files++
    st.bytes += size
  })
  return st
}

/** 默认目标目录：盘符:\\PeckleanMove\\<目录名> */
export function defaultTarget(src: string, drive: string): string {
  const letter = drive.replace(/:.*$/, '').toUpperCase()
  return path.join(`${letter}:`, 'PeckleanMove', path.basename(src))
}

/** 可用盘符（本机固定磁盘，排除网络盘/光驱，避免全盘扫描拖垮网络共享） */
export async function listDrives(): Promise<string[]> {
  const drives: string[] = []
  try {
    const out = await runPowerShell(
      'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { $_.DeviceID }'
    )
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Za-z]:)$/)
      if (m && existsSync(`${m[1]}\\`)) drives.push(m[1].toUpperCase())
    }
  } catch {
    /* CIM 不可用时走下面的兜底枚举 */
  }
  if (drives.length) return drives
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`
    if (!existsSync(root)) continue
    try {
      const st = await fs.statfs(root)
      if (st.blocks > 0) drives.push(`${letter}:`)
    } catch {
      /* 光驱/未就绪盘跳过 */
    }
  }
  return drives
}

/** 执行搬移：复制、比对、建链接，任一步失败自动回滚 */
export async function moveDirectory(
  srcRaw: string,
  destRaw: string,
  onProgress?: (p: MoveProgress) => void,
  lang: Lang = 'zh'
): Promise<MoveResult> {
  const src = path.resolve(expand(srcRaw))
  let dest = path.resolve(expand(destRaw))
  const st = await fs.lstat(src).catch(() => null)
  if (!st?.isDirectory()) {
    return { ok: false, message: pick(lang, '源目录不存在或不是文件夹', 'Source folder does not exist or is not a folder') }
  }

  // 选择框返回的必然是已存在的目录，此时它是“存放位置（父目录）”，
  // 真正的目标为 dest\<源目录名>；只有该同名子目录里已有文件时才算冲突。
  const srcName = path.basename(src)
  if (dest.toLowerCase() === src.toLowerCase()) {
    return { ok: false, message: pick(lang, '目标位置与源目录相同，请更换', 'Destination is the same as the source folder') }
  }
  const destStat = await fs.lstat(dest).catch(() => null)
  if (destStat) {
    if (!destStat.isDirectory() || destStat.isSymbolicLink()) {
      return {
        ok: false,
        message: pick(lang, '目标位置已存在同名文件，请更换', 'A file with the same name already exists at the destination')
      }
    }
    if (path.basename(dest).toLowerCase() === srcName.toLowerCase()) {
      // 选中的目录本身就是同名目标：空目录可继续，有内容才算真冲突
      if (await hasEntries(dest)) {
        return {
          ok: false,
          message: pick(
            lang,
            `目标位置已存在同名文件夹：${dest}，请更换`,
            `A folder with the same name already exists: ${dest}`
          )
        }
      }
    } else {
      const child = path.join(dest, srcName)
      const childStat = await fs.lstat(child).catch(() => null)
      if (childStat) {
        if (!childStat.isDirectory() || childStat.isSymbolicLink()) {
          return {
            ok: false,
            message: pick(
              lang,
              `目标位置已存在同名文件：${child}，请更换`,
              `A file with the same name already exists: ${child}`
            )
          }
        }
        if (await hasEntries(child)) {
          return {
            ok: false,
            message: pick(
              lang,
              `目标位置已存在同名文件夹：${child}，请更换`,
              `A folder with the same name already exists: ${child}`
            )
          }
        }
      }
      dest = child
    }
  }

  if (dest.toLowerCase() === src.toLowerCase()) {
    return { ok: false, message: pick(lang, '目标位置与源目录相同，请更换', 'Destination is the same as the source folder') }
  }
  if (dest.toLowerCase().startsWith(src.toLowerCase() + path.sep)) {
    return { ok: false, message: pick(lang, '目标目录不能放在源目录内部', 'Destination cannot be inside the source folder') }
  }

  const srcStat = await countFiles(src)
  if (srcStat.files === 0) {
    return { ok: false, message: pick(lang, '源目录为空，无需搬移', 'Source folder is empty, nothing to move') }
  }

  // 目标盘剩余空间检查
  try {
    const fsStat = await fs.statfs(path.parse(dest).root)
    const free = Number(fsStat.bavail) * Number(fsStat.bsize)
    if (free < srcStat.bytes * 1.05) {
      return {
        ok: false,
        message: pick(
          lang,
          `目标盘空间不足：需要 ${formatBytes(srcStat.bytes)}，可用 ${formatBytes(free)}`,
          `Not enough space on the target drive: need ${formatBytes(srcStat.bytes)}, available ${formatBytes(free)}`
        )
      }
    }
  } catch {
    /* 空间查询失败不阻断搬移 */
  }
  await fs.mkdir(path.dirname(dest), { recursive: true }).catch(() => null)

  onProgress?.({ phase: pick(lang, '正在复制文件…', 'Copying files…'), percent: 0 })
  const copyCode = await robocopy(src, dest, onProgress, lang)
  if (copyCode >= 8) {
    await deletePath(dest).catch(() => null)
    return {
      ok: false,
      message: pick(
        lang,
        `复制失败（robocopy 退出码 ${copyCode}），请关闭正在使用该目录的程序后重试`,
        `Copy failed (robocopy exit code ${copyCode}). Close apps using this folder and try again`
      )
    }
  }

  onProgress?.({ phase: pick(lang, '校验文件完整性…', 'Verifying files…'), percent: 99 })
  const dstStat = await countFiles(dest)
  if (dstStat.files !== srcStat.files || dstStat.bytes !== srcStat.bytes) {
    await deletePath(dest).catch(() => null)
    return {
      ok: false,
      message: pick(
        lang,
        `校验失败（源 ${srcStat.files} 个文件 / ${formatBytes(srcStat.bytes)}，目标 ${dstStat.files} 个文件 / ${formatBytes(dstStat.bytes)}），已回滚`,
        `Verification failed (source ${srcStat.files} files / ${formatBytes(srcStat.bytes)}, target ${dstStat.files} files / ${formatBytes(dstStat.bytes)}), rolled back`
      )
    }
  }

  onProgress?.({ phase: pick(lang, '正在创建目录链接…', 'Creating folder link…'), percent: 99 })
  const bak = path.join(path.dirname(src), `${path.basename(src)}.sc_bak_${Date.now()}`)
  const script = `$ErrorActionPreference='Stop'
$src='${esc(src)}'
$bak='${esc(bak)}'
$dst='${esc(dest)}'
Rename-Item -LiteralPath $src -NewName '${esc(path.basename(bak))}'
try {
  New-Item -ItemType Junction -Path $src -Target $dst | Out-Null
} catch {
  Rename-Item -LiteralPath $bak -NewName '${esc(path.basename(src))}'
  throw
}
try { [System.IO.Directory]::Delete($bak, $true) } catch {}
`
  // Junction 不需要管理员权限：先用普通权限创建，失败再提权兜底（避免每次都弹 UAC）
  try {
    await runPowerShell(script, 600000)
  } catch {
    try {
      await runElevated(script, 600000)
    } catch (e) {
      return {
        ok: false,
        message: pick(
          lang,
          `创建目录链接失败：${(e as Error).message}（数据已复制到 ${dest}）`,
          `Failed to create the folder link: ${(e as Error).message} (data copied to ${dest})`
        )
      }
    }
  }

  if (existsSync(bak)) {
    return {
      ok: true,
      message: pick(
        lang,
        `已搬移到 ${dest}，原目录已变为链接。有文件被占用，旧目录备份在 ${bak}，关闭相关程序后可手动删除`,
        `Moved to ${dest}; the original folder is now a link. Some files were in use, backup kept at ${bak} — delete it after closing the apps`
      )
    }
  }
  onProgress?.({ phase: pick(lang, '完成', 'Done'), percent: 100 })
  return {
    ok: true,
    message: pick(
      lang,
      `已搬移到 ${dest}，原目录已变为链接，软件无需任何改动`,
      `Moved to ${dest}; the original folder is now a link and apps need no changes`
    )
  }
}

/** 目录内是否已有内容（读不到时按有内容处理，避免误判可覆盖） */
async function hasEntries(dir: string): Promise<boolean> {
  try {
    return (await fs.readdir(dir)).length > 0
  } catch {
    return true
  }
}

function esc(s: string): string {
  return s.replace(/'/g, "''")
}

/** 调 robocopy，成功返回退出码（<8 表示成功） */
function robocopy(src: string, dest: string, onProgress?: (p: MoveProgress) => void, lang: Lang = 'zh'): Promise<number> {
  return new Promise((resolveP) => {
    const args = [src, dest, '/E', '/COPY:DAT', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/MT:8']
    const proc = spawn('robocopy.exe', args, { windowsHide: true })
    let lastPct = 0
    const onData = (d: Buffer): void => {
      const text = d.toString()
      const matches = text.match(/(\d{1,3}(?:\.\d+)?)%/g)
      if (matches) {
        const pct = Math.min(99, Math.floor(parseFloat(matches[matches.length - 1])))
        if (pct > lastPct) {
          lastPct = pct
          onProgress?.({ phase: pick(lang, '正在复制文件…', 'Copying files…'), percent: pct })
        }
      }
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', () => undefined)
    proc.on('close', (code) => resolveP(code ?? 16))
    proc.on('error', () => resolveP(16))
  })
}
