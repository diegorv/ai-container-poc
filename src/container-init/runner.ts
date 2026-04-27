import type { Step, StepContext } from './steps/step'

export interface RunResult {
  /** Number of steps that returned `ok: false` or threw. */
  failed: number
  /** Number of steps that completed successfully. */
  succeeded: number
}

/**
 * Runs each step sequentially. A failing step does not abort the
 * pipeline — every step is attempted (mirroring post_install.py).
 */
export async function runSteps(steps: readonly Step[], ctx: StepContext): Promise<RunResult> {
  let failed = 0
  let succeeded = 0
  for (const step of steps) {
    ctx.logger.info(`▶ ${step.name}`)
    try {
      const result = await step.run(ctx)
      if (result.ok) {
        ctx.logger.success(`✓ ${step.name}: ${result.message}`)
        succeeded += 1
      } else {
        ctx.logger.error(`✗ ${step.name}: ${result.error}`)
        failed += 1
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      ctx.logger.error(`✗ ${step.name}: ${msg}`)
      failed += 1
    }
  }
  return { failed, succeeded }
}
