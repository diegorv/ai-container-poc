#!/usr/bin/env node
// mydevc CLI entry point — composition root.
// Phase 1 stub. Real wiring lands in Phase 5/7.
export {}

async function main(): Promise<void> {
  // biome-ignore lint/suspicious/noConsoleLog: scaffolding stub
  console.log('mydevc: not yet implemented (Phase 1 scaffold)')
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
