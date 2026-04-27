import type { Step } from './step'

const CLAUDE_TIMEOUT_MS = 30_000

/**
 * Ports `setup_onboarding_bypass` from post_install.py.
 *
 * When `CLAUDE_CODE_OAUTH_TOKEN` is set, runs `claude -p ok` (with a
 * 30s timeout) so claude writes its `.claude.json` file, then forces
 * `hasCompletedOnboarding=true`. Skips silently if the token is absent
 * or the claude binary fails to start.
 */
export const claudeBypassStep: Step = {
  name: 'claude:bypass',
  async run({ env, fs, homeDir, shell }) {
    const token = (env.CLAUDE_CODE_OAUTH_TOKEN ?? '').trim()
    if (!token) {
      return { ok: true, message: 'no CLAUDE_CODE_OAUTH_TOKEN set, skipping' }
    }

    const claudeJsonDir = env.CLAUDE_CONFIG_DIR ?? homeDir
    const claudeJson = `${claudeJsonDir}/.claude.json`

    const claudeBin = await shell.which('claude')
    if (!claudeBin) {
      return { ok: false, error: 'claude binary not found on PATH' }
    }

    // claude -p often takes longer than the API call to write its config,
    // so we tolerate the timeout and check the file afterwards.
    try {
      await shell.exec('claude', ['-p', 'ok'], { timeoutMs: CLAUDE_TIMEOUT_MS })
    } catch {
      // ignore; checked below
    }

    if (!(await fs.exists(claudeJson))) {
      return { ok: false, error: `${claudeJson} not created by claude -p` }
    }

    let config: Record<string, unknown> = {}
    try {
      config = JSON.parse(await fs.readFile(claudeJson)) as Record<string, unknown>
    } catch {
      // start fresh on malformed JSON, matching post_install.py behaviour.
    }
    config.hasCompletedOnboarding = true
    await fs.writeFile(claudeJson, `${JSON.stringify(config, null, 2)}\n`)
    return { ok: true, message: `bypass configured at ${claudeJson}` }
  },
}
