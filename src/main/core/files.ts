/** 大文件与重复文件引擎：按体积筛选大文件，按「大小 → 头部哈希 → MD5」找重复 */
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { md5File, walkFiles } from './utils'
import { BigFileItem, DuplicateGroup } from '../../shared/types'

const SKIP_DIRS = new Set([
  'windows',
  'program files',
  'program files (x86)',
  'programdata',
  '$recycle.bin',
  'system volume information',
  'appdata'
])

/** 扫描大文件（默认从用户目录找 >= minMB 的文件） */
export async function findBigFiles(
  roots: string[],
  minMB: number,
  onProgress?: (current: string) => void
): Promise<BigFileItem[]> {
  const min = minMB * 1024 * 1024
  const found: BigFileItem[] = []
  for (const root of roots) {
    onProgress?.(root)
    await walkFiles(root, (full, size) => {
      if (size >= min) {
        found.push({ path: full, bytes: size, modified: 0 })
      }
    })
  }
  // 补充修改时间（只取大文件，数量有限）
  await Promise.all(
    found.slice(0, 500).map(async (f) => {
      const st = await fs.stat(f.path).catch(() => null)
      if (st) f.modified = st.mtimeMs
    })
  )
  found.sort((a, b) => b.bytes - a.bytes)
  return found.slice(0, 300)
}

export const DEFAULT_BIG_ROOTS = [
  path.join(os.homedir(), 'Downloads'),
  path.join(os.homedir(), 'Documents'),
  path.join(os.homedir(), 'Videos'),
  path.join(os.homedir(), 'Desktop')
]

/** 重复文件查找：按大小分组 → 头部 256KB 预哈希 → 全量 MD5 */
export async function findDuplicates(
  root: string,
  onProgress?: (scanned: number) => void
): Promise<DuplicateGroup[]> {
  const bySize = new Map<number, string[]>()
  let scanned = 0
  await walkFiles(root, (full, size) => {
    if (size === 0) return
    scanned++
    if (scanned % 200 === 0) onProgress?.(scanned)
    const arr = bySize.get(size)
    if (arr) arr.push(full)
    else bySize.set(size, [full])
  })

  // 只处理同大小 >=2 的组
  const sizeGroups = [...bySize.entries()].filter(([, files]) => files.length >= 2)
  // 预哈希
  const byHead = new Map<string, string[]>()
  for (const [, files] of sizeGroups) {
    for (const f of files) {
      const head = await headHash(f)
      const key = head
      const arr = byHead.get(key)
      if (arr) arr.push(f)
      else byHead.set(key, [f])
    }
  }

  const groups: DuplicateGroup[] = []
  for (const [, files] of byHead) {
    if (files.length < 2) continue
    const byFull = new Map<string, { path: string; bytes: number }[]>()
    for (const f of files) {
      const hash = await md5File(f).catch(() => '')
      if (!hash) continue
      const st = await fs.stat(f).catch(() => null)
      const entry = { path: f, bytes: st?.size ?? 0 }
      const arr = byFull.get(hash)
      if (arr) arr.push(entry)
      else byFull.set(hash, [entry])
    }
    for (const [hash, entries] of byFull) {
      if (entries.length >= 2) groups.push({ hash, files: entries })
    }
  }
  groups.sort((a, b) => b.files[0].bytes * (b.files.length - 1) - a.files[0].bytes * (a.files.length - 1))
  return groups
}

const HEAD_LEN = 256 * 1024

async function headHash(file: string): Promise<string> {
  const fh = await fs.open(file, 'r')
  try {
    const buf = Buffer.alloc(HEAD_LEN)
    await fh.read(buf, 0, HEAD_LEN, 0)
    // 头部哈希掺入文件大小，避免不同大小同头文件误判
    const size = (await fh.stat()).size
    return `${size}:${require('crypto').createHash('md5').update(buf).digest('hex')}`
  } finally {
    await fh.close()
  }
}

/** 删除用户勾选的文件 */
export async function deleteFiles(paths: string[]): Promise<{ files: number; errors: string[] }> {
  const res = { files: 0, errors: [] as string[] }
  for (const p of paths) {
    await fs.unlink(p).then(() => res.files++, (e) => res.errors.push(`${p}: ${e.message}`))
  }
  return res
}
