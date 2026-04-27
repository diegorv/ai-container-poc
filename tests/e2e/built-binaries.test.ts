import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '..', '..')
const cliJs = join(repoRoot, 'dist/cli/index.js')
const initJs = join(repoRoot, 'dist/container-init/index.js')

beforeAll(() => {
  // Ensure the dist/ output is available for the tests below.
  if (!existsSync(cliJs) || !existsSync(initJs)) {
    execSync('pnpm build', { cwd: repoRoot, stdio: 'inherit' })
  }
}, 60_000)

describe('mydevc CLI (built bundle)', () => {
  it('prints help with the full command list', () => {
    const stdout = execSync(`node ${cliJs} help`, { cwd: repoRoot }).toString()
    expect(stdout).toContain('Usage: mydevc')
    for (const cmd of [
      'template',
      'up',
      'rebuild',
      'down',
      'shell',
      'exec',
      'destroy',
      'mount',
      'sync',
      'cp',
      'self-install',
      'update',
    ]) {
      expect(stdout).toContain(cmd)
    }
  })

  it('exits non-zero with a friendly message on unknown commands', () => {
    let exit = 0
    let stderr = ''
    try {
      execSync(`node ${cliJs} no-such-cmd`, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      const e = err as { status?: number; stderr?: Buffer }
      exit = e.status ?? -1
      stderr = e.stderr?.toString() ?? ''
    }
    expect(exit).toBeGreaterThan(0)
    expect(stderr).toContain('Unknown command')
  })
})

describe('mydevc-init (built bundle)', () => {
  let homeDir: string

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'mydevc-init-'))
  })

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true })
  })

  it('runs every step against a fresh HOME and exits 0', () => {
    const env: NodeJS.ProcessEnv = { HOME: homeDir, PATH: process.env.PATH }
    execSync(`node ${initJs}`, { cwd: repoRoot, env })

    expect(existsSync(join(homeDir, '.tmux.conf'))).toBe(true)
    expect(existsSync(join(homeDir, '.gitignore_global'))).toBe(true)
    expect(existsSync(join(homeDir, '.gitconfig.local'))).toBe(true)
    const tmux = readFileSync(join(homeDir, '.tmux.conf'), 'utf-8')
    expect(tmux).toContain('history-limit 200000')
    const gitconfig = readFileSync(join(homeDir, '.gitconfig.local'), 'utf-8')
    expect(gitconfig).toContain(`path = ${homeDir}/.gitconfig`)
  })
})
