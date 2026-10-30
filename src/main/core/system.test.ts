/** system.ts 纯函数单元测试 — 用 Node 内置 assert，零额外依赖 */
import assert from 'node:assert'
import {
  parseDefragPct,
  mapDriveRaw,
  mapMemRaw,
  parseBoostOutput,
  buildMemBoostScript,
  formatMem
} from './system'

let passed = 0
let failed = 0
const failures: string[] = []

function test(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    const msg = (e as Error).message
    failures.push(`${name}: ${msg}`)
    console.log(`  ✗ ${name}\n    ${msg}`)
  }
}

// ═══════════════════════════════════════════════════════════════════
// parseDefragPct
// ═══════════════════════════════════════════════════════════════════
console.log('\n--- parseDefragPct ---')

test('Windows 10 "Total fragmented space = 24% (123456789 bytes)"', () => {
  const out = 'Total fragmented space    = 24% (123456789 bytes)\r\n'
  assert.strictEqual(parseDefragPct(out), 24)
})

test('Windows 11 with leading/trailing spaces', () => {
  const out = '  Total fragmented space = 7% \r\n'
  assert.strictEqual(parseDefragPct(out), 7)
})

test('Fallback regex "Analysis complete. (3% fragmented)"', () => {
  const out = 'Analysis complete. (3% fragmented)\r\n'
  assert.strictEqual(parseDefragPct(out), 3)
})

test('No match → null', () => {
  assert.strictEqual(parseDefragPct('some random text'), null)
})

test('Empty string → null', () => {
  assert.strictEqual(parseDefragPct(''), null)
})

test('Case insensitive', () => {
  const out = 'TOTAL FRAGMENTED SPACE = 42% (1 bytes)'
  assert.strictEqual(parseDefragPct(out), 42)
})

// ═══════════════════════════════════════════════════════════════════
// mapDriveRaw
// ═══════════════════════════════════════════════════════════════════
console.log('\n--- mapDriveRaw ---')

test('Array of drives', () => {
  const json = JSON.stringify([
    { Letter: 'C:', Label: 'System', FS: 'NTFS', TotalMB: 500000, FreeMB: 200000, Type: 'Fixed' },
    { Letter: 'D:', Label: '', FS: 'NTFS', TotalMB: 1000000, FreeMB: 800000, Type: 'Fixed' }
  ])
  const drives = mapDriveRaw(json)
  assert.strictEqual(drives.length, 2)
  assert.strictEqual(drives[0].letter, 'C:')
  assert.strictEqual(drives[0].label, 'System')
  assert.strictEqual(drives[0].fs, 'NTFS')
  assert.strictEqual(drives[0].totalMB, 500000)
  assert.strictEqual(drives[0].freeMB, 200000)
  assert.strictEqual(drives[0].type, 'Fixed')
  assert.strictEqual(drives[0].fragmented, null)
  assert.strictEqual(drives[1].letter, 'D:')
})

test('Single object (not array) → wrapped', () => {
  const json = JSON.stringify({ Letter: 'E:', TotalMB: 100000, FreeMB: 50000, Type: 'Removable' })
  const drives = mapDriveRaw(json)
  assert.strictEqual(drives.length, 1)
  assert.strictEqual(drives[0].letter, 'E:')
  assert.strictEqual(drives[0].type, 'Removable')
})

test('Fields missing → defaults', () => {
  const json = '{}'
  const drives = mapDriveRaw(json)
  assert.strictEqual(drives.length, 1)
  assert.strictEqual(drives[0].letter, '')
  assert.strictEqual(drives[0].label, '')
  assert.strictEqual(drives[0].fs, '')
  assert.strictEqual(drives[0].totalMB, 0)
  assert.strictEqual(drives[0].freeMB, 0)
  assert.strictEqual(drives[0].type, 'Unknown')
})

test('Invalid JSON → empty array', () => {
  assert.deepStrictEqual(mapDriveRaw('not json at all'), [])
})

test('Empty string → empty array', () => {
  assert.deepStrictEqual(mapDriveRaw(''), [])
})

// ═══════════════════════════════════════════════════════════════════
// mapMemRaw
// ═══════════════════════════════════════════════════════════════════
console.log('\n--- mapMemRaw ---')

test('Typical output 32GB, 20GB used', () => {
  const json = JSON.stringify({
    TotalMB: 32768,
    FreeMB: 12288,
    Top: [
      { Name: 'chrome', PID: 1234, MemMB: 800 },
      { Name: 'weixin', PID: 5678, MemMB: 600 }
    ]
  })
  const m = mapMemRaw(json)
  assert.strictEqual(m.totalMB, 32768)
  assert.strictEqual(m.availableMB, 12288)
  assert.strictEqual(m.usedMB, 20480)
  assert.strictEqual(m.usedPct, 63) // 20480/32768 = 0.625 → 63
  assert.strictEqual(m.topProcesses.length, 2)
  assert.strictEqual(m.topProcesses[0].name, 'chrome')
  assert.strictEqual(m.topProcesses[0].pid, 1234)
  assert.strictEqual(m.topProcesses[0].memMB, 800)
})

test('Zero total mem → 0 usedPct', () => {
  const json = JSON.stringify({ TotalMB: 0, FreeMB: 0, Top: [] })
  const m = mapMemRaw(json)
  assert.strictEqual(m.usedPct, 0)
  assert.strictEqual(m.topProcesses.length, 0)
})

test('Free > total (defensive clamp)', () => {
  const json = JSON.stringify({ TotalMB: 1000, FreeMB: 2000, Top: [] })
  const m = mapMemRaw(json)
  assert.strictEqual(m.usedMB, 0) // Math.max(0, negative)
  assert.strictEqual(m.usedPct, 0)
})

test('Invalid JSON → zero struct', () => {
  const m = mapMemRaw('garbage')
  assert.deepStrictEqual(m, { totalMB: 0, availableMB: 0, usedMB: 0, usedPct: 0, topProcesses: [] })
})

test('Missing Top field → empty array', () => {
  const json = JSON.stringify({ TotalMB: 8192, FreeMB: 4096 })
  const m = mapMemRaw(json)
  assert.strictEqual(m.topProcesses.length, 0)
})

// ═══════════════════════════════════════════════════════════════════
// parseBoostOutput
// ═══════════════════════════════════════════════════════════════════
console.log('\n--- parseBoostOutput ---')

test('Normal output', () => {
  const out = 'Before: 20480/32768MB (63%)\nFREED=1500\nCOUNT=12\nAfter: 19000/32768MB (58%)'
  assert.deepStrictEqual(parseBoostOutput(out), { freedMB: 1500, count: 12 })
})

test('Windows CRLF line endings', () => {
  const out = "FREED=200\r\nCOUNT=5\r\n"
  assert.deepStrictEqual(parseBoostOutput(out), { freedMB: 200, count: 5 })
})

test('No matches → zeros', () => {
  assert.deepStrictEqual(parseBoostOutput('nothing here'), { freedMB: 0, count: 0 })
})

test('Only COUNT line', () => {
  assert.deepStrictEqual(parseBoostOutput('COUNT=7'), { freedMB: 0, count: 7 })
})

test('Malformed FREED=abc → no match', () => {
  assert.deepStrictEqual(parseBoostOutput('FREED=abc\nCOUNT=3'), { freedMB: 0, count: 3 })
})

// ═══════════════════════════════════════════════════════════════════
// buildMemBoostScript
// ═══════════════════════════════════════════════════════════════════
console.log('\n--- buildMemBoostScript ---')

test('Default includes system process exclusion', () => {
  const s = buildMemBoostScript()
  assert.ok(s.includes('EmptyWorkingSet'), 'has EmptyWorkingSet p/invoke')
  assert.ok(s.includes('psapi.dll'), 'has psapi.dll')
  assert.ok(s.includes('WorkingSet64 -gt 50 * 1MB'), 'default threshold 50MB')
  assert.ok(s.includes('System Idle Process'), 'includes system process in exclusion list')
  assert.ok(s.includes('MemCompression'), 'excludes MemCompression')
  assert.ok(s.includes('FREED='), 'outputs FREED line')
  assert.ok(s.includes('COUNT='), 'outputs COUNT line')
})

test('Custom threshold', () => {
  const s = buildMemBoostScript(100)
  assert.ok(s.includes('WorkingSet64 -gt 100 * 1MB'))
})

test('excludeSystem=false → no exclusion filter', () => {
  const s = buildMemBoostScript(50, false)
  assert.ok(s.includes('$true'), 'fallback body is $true')
  assert.ok(!s.includes('-notin'), 'no -notin exclusion operator')
})

// ═══════════════════════════════════════════════════════════════════
// formatMem
// ═══════════════════════════════════════════════════════════════════
console.log('\n--- formatMem ---')

test('Typical 32GB / 20GB used', () => {
  const r = formatMem({ totalMB: 32768, availableMB: 12288, usedMB: 20480, usedPct: 63, topProcesses: [] })
  assert.strictEqual(r, '20480/32768MB (63%)')
})

test('Zero total → "mem unknown"', () => {
  const r = formatMem({ totalMB: 0, availableMB: 0, usedMB: 0, usedPct: 0, topProcesses: [] })
  assert.strictEqual(r, 'mem unknown')
})

// ═══════════════════════════════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
} else {
  console.log('All tests passed ✓')
  process.exit(0)
}
