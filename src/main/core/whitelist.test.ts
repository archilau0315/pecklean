/** whitelist.ts 纯函数单元测试 — Node 内置 assert，零额外依赖 */
import assert from 'node:assert'
import { globMatch, matchesWhitelist, filterWhitelisted, parseTextarea } from './whitelist'

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
// globMatch — 极简 DFA 实现 * 和 ?
// ═══════════════════════════════════════════════════════════════════
console.log('\n--- globMatch ---')

test('exact match', () => assert.strictEqual(globMatch('foo.log', 'foo.log'), true))
test('* wildcard suffix', () => assert.strictEqual(globMatch('foo.log', '*.log'), true))
test('* wildcard prefix', () => assert.strictEqual(globMatch('error.log', 'error.*'), true))
test('? single char', () => assert.strictEqual(globMatch('backup1.bak', 'backup?.bak'), true))
test('prefix * with middle', () => assert.strictEqual(globMatch('temp_abc.tmp', 'temp_*.tmp'), true))
test('no match different ext', () => assert.strictEqual(globMatch('foo.log', '*.tmp'), false))
test('multiple *', () => assert.strictEqual(globMatch('a_b_c.txt', 'a_*_*.txt'), true))
test('empty name → false', () => assert.strictEqual(globMatch('', '*.log'), false))
test('empty pattern → false', () => assert.strictEqual(globMatch('foo', ''), false))
test('tail * swallows rest', () => assert.strictEqual(globMatch('anything_here', '*'), true))

// ═══════════════════════════════════════════════════════════════════
// matchesWhitelist — 路径前缀 + glob 通配
// ═══════════════════════════════════════════════════════════════════
console.log('\n--- matchesWhitelist ---')

test('empty patterns → false', () =>
  assert.strictEqual(matchesWhitelist('C:\\x\\a.txt', []), false))

test('path prefix exact', () =>
  assert.strictEqual(matchesWhitelist('C:\\Users\\Important\\a.txt', ['C:\\Users\\Important']), true))

test('path prefix child subdir', () =>
  assert.strictEqual(matchesWhitelist('C:\\Users\\Important\\sub\\b.txt', ['C:\\Users\\Important']), true))

test('path prefix case insensitive', () =>
  assert.strictEqual(matchesWhitelist('c:\\users\\important\\a.txt', ['C:\\Users\\Important']), true))

test('glob *.log matches any basename', () =>
  assert.strictEqual(matchesWhitelist('C:\\temp\\error.log', ['*.log']), true))

test('glob no match', () =>
  assert.strictEqual(matchesWhitelist('C:\\temp\\error.dat', ['*.log']), false))

test('slash normalization forward→back', () =>
  assert.strictEqual(matchesWhitelist('C:/Users/x/a.txt', ['C:\\Users\\x']), true))

test('trailing slash stripped', () =>
  assert.strictEqual(matchesWhitelist('C:\\Users\\x\\a.txt', ['C:\\Users\\x\\']), true))

test('glob only checks basename not path', () => {
  // *.log 应该只匹配文件名，不匹配路径中的某段
  assert.strictEqual(matchesWhitelist('C:\\temp\\foo\\bar.txt', ['*.log']), false)
})

// ═══════════════════════════════════════════════════════════════════
// filterWhitelisted — 批量过滤
// ═══════════════════════════════════════════════════════════════════
console.log('\n--- filterWhitelisted ---')

test('empty patterns → kept all', () => {
  const r = filterWhitelisted(['a.txt', 'b.txt'], [])
  assert.strictEqual(r.kept.length, 2)
  assert.strictEqual(r.removed, 0)
})

test('mixed filter', () => {
  const r = filterWhitelisted(
    ['C:\\temp\\a.log', 'C:\\temp\\b.dat', 'C:\\Users\\Important\\c.txt'],
    ['*.log', 'C:\\Users\\Important']
  )
  assert.strictEqual(r.kept.length, 1)
  assert.strictEqual(r.kept[0], 'C:\\temp\\b.dat')
  assert.strictEqual(r.removed, 2)
})

test('all filtered', () => {
  const r = filterWhitelisted(['a.log', 'b.log'], ['*.log'])
  assert.deepStrictEqual(r.kept, [])
  assert.strictEqual(r.removed, 2)
})

test('none filtered', () => {
  const r = filterWhitelisted(['a.txt', 'b.dat'], ['*.log'])
  assert.strictEqual(r.kept.length, 2)
  assert.strictEqual(r.removed, 0)
})

// ═══════════════════════════════════════════════════════════════════
// parseTextarea — UI textarea → patterns[]
// ═══════════════════════════════════════════════════════════════════
console.log('\n--- parseTextarea ---')

test('normal lines', () => {
  const r = parseTextarea('C:\\Users\\x\n*.log\ntemp_*.bak')
  assert.deepStrictEqual(r, ['C:\\Users\\x', '*.log', 'temp_*.bak'])
})

test('trailing empty line trimmed', () => {
  const r = parseTextarea('a\nb\n\n')
  assert.deepStrictEqual(r, ['a', 'b'])
})

test('leading/trailing whitespace per line', () => {
  const r = parseTextarea('  C:\\path  \n  *.log  ')
  assert.deepStrictEqual(r, ['C:\\path', '*.log'])
})

test('CRLF line endings', () => {
  const r = parseTextarea('a\r\nb\r\nc')
  assert.deepStrictEqual(r, ['a', 'b', 'c'])
})

test('empty string → empty array', () => {
  assert.deepStrictEqual(parseTextarea(''), [])
})

test('only whitespace → empty array', () => {
  assert.deepStrictEqual(parseTextarea('   \n  \n\t\n'), [])
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
