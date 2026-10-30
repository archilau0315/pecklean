/** 验证 optimize 模块：HKCU 直接读写，HKLM 走 UAC */
import { OPTIMIZE_ITEMS, scanOptimize } from './src/main/core/optimize.js'

async function main(): Promise<void> {
  console.log('=== ITEMS ===')
  for (const it of OPTIMIZE_ITEMS) {
    const keys = it.regs.map(r => r.key.split('\\')[0]).join(' + ')
    console.log(`${it.admin ? '[ADMIN]' : '[NORMAL]'}  ${it.id.padEnd(34)}  keys: ${keys}`)
  }

  console.log('\n=== SCAN ===')
  const rows = await scanOptimize()
  for (const r of rows) {
    const tag = r.admin ? '[ADMIN]' : '[NORMAL]'
    const st = r.applied ? 'APPLIED ' : '--------'
    const d = r.detail.map(x => x.applied ? '+' : '.').join('')
    console.log(`${tag}  ${st}  ${r.id.padEnd(34)} [${d}]`)
  }
  const total = rows.length
  const applied = rows.filter(r => r.applied).length
  const adminCount = rows.filter(r => r.admin).length
  console.log(`\nApplied: ${applied}/${total}  Admin-required items: ${adminCount}`)
}

main().catch(e => { console.error(e); process.exit(1) })
