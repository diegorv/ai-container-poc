import { joinPath, operatorPath, safeFilename } from '@/core/security/path'
import type { Step } from './step'

const DOT_CLAUDE_SEG = safeFilename('.claude')
const SETTINGS_JSON_SEG = safeFilename('settings.json')

interface PermissionsBlock {
  defaultMode?: string
}

interface ClaudeSettings {
  permissions?: PermissionsBlock
  [key: string]: unknown
}

/**
 * Ports `setup_claude_settings` from post_install.py — sets
 * `permissions.defaultMode = "bypassPermissions"` in
 * `$CLAUDE_CONFIG_DIR/settings.json` (or `~/.claude/settings.json`).
 * Existing keys are preserved.
 */
export const claudeSettingsStep: Step = {
  name: 'claude:settings',
  async run({ env, fs, homeDir }) {
    const claudeDir = env.CLAUDE_CONFIG_DIR
      ? operatorPath(env.CLAUDE_CONFIG_DIR)
      : joinPath(homeDir, DOT_CLAUDE_SEG)
    const settingsFile = joinPath(claudeDir, SETTINGS_JSON_SEG)
    await fs.mkdir(claudeDir, { recursive: true })

    let settings: ClaudeSettings = {}
    if (await fs.exists(settingsFile)) {
      try {
        settings = JSON.parse(await fs.readFile(settingsFile)) as ClaudeSettings
      } catch {
        settings = {}
      }
    }

    const permissions: PermissionsBlock = settings.permissions ?? {}
    permissions.defaultMode = 'bypassPermissions'
    settings.permissions = permissions

    await fs.writeFile(settingsFile, `${JSON.stringify(settings, null, 2)}\n`)
    return { ok: true, message: `bypassPermissions=true at ${settingsFile}` }
  },
}
