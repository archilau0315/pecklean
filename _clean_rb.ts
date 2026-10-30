// 只清回收站——需要长超时
import { cleanJunk } from './src/main/core/junk'

async function main() {
  console.log('Clearing Recycle Bin (may take minutes for 3.5GB)...')
  const res = await cleanJunk(['recyclebin'], (p) => {
    console.log(`  [${p.done}/${p.total}] ${p.current}`)
  })
  console.log(`Done: ${res.files} files, ${(res.bytes / 1024 / 1024).toFixed(0)} MB`)
  if (res.errors.length > 0) console.log(`Errors: ${res.errors.join(', ')}`)
}
main().catch(console.error)
