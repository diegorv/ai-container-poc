import type { Step, StepContext } from './steps/step'

export interface RunResult {
  /** Number of steps that returned `ok: false` or threw. */
  failed: number
  /** Number of steps that completed successfully. */
  succeeded: number
}

export interface RunOptions {
  /**
   * Per-step timeout in milliseconds. A step that exceeds this is
   * counted as a failure and the runner moves on. Defaults to
   * {@link DEFAULT_STEP_TIMEOUT_MS}; set to `0` to disable.
   */
  stepTimeoutMs?: number
}

/**
 * Default per-step timeout. Long enough that `claude -p ok` (which
 * already self-bounds at 30s in claudeBypassStep) plus a slow chown
 * fit comfortably, short enough that a hung step doesn't pin the
 * container's postCreate forever.
 */
export const DEFAULT_STEP_TIMEOUT_MS = 90_000

/**
 * Runs each step sequentially. A failing step does not abort the
 * pipeline — every step is attempted (mirroring post_install.py).
 *
 * Each step is also bounded by `stepTimeoutMs` so a single hung
 * subprocess (e.g. a network call inside a step that ignores its own
 * timeout) cannot block the entire init forever; the runner logs the
 * timeout, charges it as a failure, and moves on.
 */
export async function runSteps(
  steps: readonly Step[],
  ctx: StepContext,
  options?: RunOptions,
): Promise<RunResult> {
  const stepTimeoutMs = options?.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS
  let failed = 0
  let succeeded = 0
  for (const step of steps) {
    ctx.logger.info(`▶ ${step.name}`)
    try {
      const result = await runWithTimeout(step, ctx, stepTimeoutMs)
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

async function runWithTimeout(
  step: Step,
  ctx: StepContext,
  timeoutMs: number,
): Promise<Awaited<ReturnType<Step['run']>>> {
  if (timeoutMs <= 0) return step.run(ctx)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`step timed out after ${timeoutMs}ms`)), timeoutMs)
  })
  try {
    return await Promise.race([step.run(ctx), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
