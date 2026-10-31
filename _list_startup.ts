import { listStartup } from './src/main/core/startup'

async function main() {
  const items = await listStartup()
  console.log(`启动项 ${items.length} 个：`)
  for (const s of items) {
    console.log(`  [${s.enabled ? 'ON ' : 'off'}] ${s.name}  |  ${(s.command || '').slice(0, 80)}`)
  }
}
main().catch(console.error)
