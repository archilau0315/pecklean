import { cleanJunk, JUNK_IDS } from './src/main/core/junk'
import { scanPrivacy, cleanPrivacy } from './src/main/core/privacy'

async function main() {
  // 清剩余垃圾（排除 recyclebin 已经清了）
  console.log('=== 清剩余垃圾 ===')
  const ids = JUNK_IDS.filter((id) => id !== 'recyclebin')
  const jRes = await cleanJunk(ids, (p) => {
    if (p.current) console.log(`  [${p.done}/${p.total}] ${p.current}`)
  })
  console.log(`Done: ${jRes.files} files, ${(jRes.bytes / 1024 / 1024).toFixed(0)} MB`)
  if (jRes.errors.length > 0) console.log(`Errors: ${jRes.errors.join(', ')}`)

  // 清隐私
  console.log('\n=== 清隐私 ===')
  const privItems = await scanPrivacy()
  const pRes = await cleanPrivacy(privItems.map((p) => p.id))
  console.log(`Done: ${pRes.files} files, ${(pRes.bytes / 1024 / 1024).toFixed(0)} MB`)
  if (pRes.errors.length > 0) console.log(`Errors: ${pRes.errors.join(', ')}`)

  // 再体检
  console.log('\n=== 重新体检 ===')
  const { runFullDiagnosis } = await import('./src/main/core/optimize')
  const r = await runFullDiagnosis()
  console.log(`分数: ${r.score}/100`)
  console.log(`垃圾: ${(r.junkBytes / 1024 / 1024).toFixed(2)} MB`)
  console.log(`隐私: ${r.privacyIds.length} items`)
  console.log(`启动项禁用: ${r.startupDisabled}/${r.startupTotal}`)
  console.log(`optimize: ${r.optimizeApplied}/${r.optimizeTotal}`)
  if (r.tips.length > 0) console.log(`tips: ${r.tips.join(' | ')}`)
}
main().catch(console.error)
