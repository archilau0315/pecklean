import { scanJunk, cleanJunk, JUNK_IDS } from './src/main/core/junk'
import { scanPrivacy, cleanPrivacy } from './src/main/core/privacy'

async function main() {
  // 1. 清垃圾（全部规则）
  console.log('=== 清垃圾 ===')
  const junkResult = await cleanJunk(JUNK_IDS, (p) => {
    if (p.current) console.log(`  [${p.done}/${p.total}] ${p.current}`)
  })
  console.log(`Done: ${junkResult.files} files, ${(junkResult.bytes / 1024 / 1024).toFixed(0)} MB`)
  if (junkResult.errors.length > 0) console.log(`Errors: ${junkResult.errors.join(', ')}`)

  // 2. 清隐私
  console.log('\n=== 清隐私 ===')
  const privacyItems = await scanPrivacy()
  const privResult = await cleanPrivacy(privacyItems.map((p) => p.id))
  console.log(`Done: ${privResult.files} files, ${(privResult.bytes / 1024 / 1024).toFixed(0)} MB`)
  if (privResult.errors.length > 0) console.log(`Errors: ${privResult.errors.join(', ')}`)

  // 3. 再跑一次体检
  console.log('\n=== 重新体检 ===')
  const { runFullDiagnosis } = await import('./src/main/core/optimize')
  const r = await runFullDiagnosis()
  console.log(`分数: ${r.score}/100`)
  console.log(`垃圾: ${(r.junkBytes / 1024 / 1024).toFixed(0)} MB`)
  console.log(`隐私: ${r.privacyIds.length} items`)
  console.log(`启动项禁用: ${r.startupDisabled}/${r.startupTotal}`)
  console.log(`optimize: ${r.optimizeApplied}/${r.optimizeTotal}`)
}
main().catch(console.error)
