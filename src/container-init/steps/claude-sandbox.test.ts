import { execa } from 'execa'
import { describe, expect, it } from 'vitest'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { p } from '@/test-utils/path'
import { claudeSandboxStep } from './claude-sandbox'
import type { StepContext } from './step'

async function makeCtx(
  opts: { withBwrap?: boolean; usernsBlocked?: boolean } = {},
): Promise<StepContext & { logger: ReturnType<typeof createMemoryLogger> }> {
  const fs = createMemoryFs()
  await fs.mkdir(p('/home/vscode'), { recursive: true })
  const shell = createFakeShell({
    binaries: opts.withBwrap === false ? {} : { bwrap: '/usr/bin/bwrap' },
    responder: opts.usernsBlocked
      ? (cmd, args) =>
          cmd === 'bwrap' && args[0] === '--unshare-user'
            ? {
                exitCode: 1,
                stderr:
                  'bwrap: No permissions to create new namespace, likely because the kernel does not allow non-privileged user namespaces.',
              }
            : undefined
      : undefined,
  })
  return {
    fs,
    shell,
    logger: createMemoryLogger(),
    homeDir: p('/home/vscode'),
    uid: 1000,
    gid: 1000,
    env: { HOME: p('/home/vscode') },
  }
}

describe('claude-sandbox step', () => {
  it('installs claude-jail at ~/.local/bin/claude-jail when bwrap is present', async () => {
    const c = await makeCtx()
    const r = await claudeSandboxStep.run(c)
    expect(r.ok).toBe(true)

    const path = p('/home/vscode/.local/bin/claude-jail')
    expect(await c.fs.exists(path)).toBe(true)

    const content = await c.fs.readFile(path)
    expect(content.startsWith('#!/bin/sh')).toBe(true)
    expect(content).toContain('exec bwrap')
    expect(content).toContain('--ro-bind / /')
    expect(content).toContain('--bind "$CWD" "$CWD"')
    expect(content).toContain('--ro-bind-try /dev/null "$HOME/.claude/credentials.json"')
    expect(content).toContain('--ro-bind-try /dev/null "$HOME/.claude/.credentials.json"')
    expect(content).toContain('--ro-bind-try /dev/null "$HOME/.config/gh/hosts.yml"')
    expect(content).not.toContain('--tmpfs "$HOME/.claude"')
    expect(content).toContain('CLAUDE_JAIL_DISABLE')
  })

  it('preserves ~/.claude/{settings.json,projects,plugins} (no broad tmpfs)', async () => {
    const c = await makeCtx()
    await claudeSandboxStep.run(c)
    const content = await c.fs.readFile(p('/home/vscode/.local/bin/claude-jail'))
    // Anything that would mask the whole ~/.claude dir would break
    // bypassPermissions / mydevc sync / plugins inside the jail.
    expect(content).not.toMatch(/--tmpfs\s+"\$HOME\/\.claude"/)
    expect(content).not.toMatch(/--tmpfs\s+"\$HOME\/\.config\/gh"/)
  })

  it('falls back to `command -v claude` with a recursion guard', async () => {
    const c = await makeCtx()
    await claudeSandboxStep.run(c)
    const content = await c.fs.readFile(p('/home/vscode/.local/bin/claude-jail'))
    expect(content).toContain('command -v claude')
    expect(content).toContain('"$candidate" != "$0"')
  })

  it('the generated shim is syntactically valid POSIX sh', async () => {
    const c = await makeCtx()
    await claudeSandboxStep.run(c)
    const content = await c.fs.readFile(p('/home/vscode/.local/bin/claude-jail'))
    const r = await execa('sh', ['-n'], { input: content, reject: false })
    expect({ exitCode: r.exitCode, stderr: r.stderr }).toEqual({ exitCode: 0, stderr: '' })
  })

  it('marks the shim executable (mode 0o755)', async () => {
    const c = await makeCtx()
    await claudeSandboxStep.run(c)
    const stat = await c.fs.stat(p('/home/vscode/.local/bin/claude-jail'))
    expect(stat.mode & 0o777).toBe(0o755)
  })

  it('creates ~/.local/bin if it does not yet exist', async () => {
    const c = await makeCtx()
    expect(await c.fs.exists(p('/home/vscode/.local/bin'))).toBe(false)
    const r = await claudeSandboxStep.run(c)
    expect(r.ok).toBe(true)
    expect(await c.fs.exists(p('/home/vscode/.local/bin'))).toBe(true)
  })

  it('overwrites an existing claude-jail (idempotent across rebuilds)', async () => {
    const c = await makeCtx()
    await c.fs.mkdir(p('/home/vscode/.local/bin'), { recursive: true })
    await c.fs.writeFile(p('/home/vscode/.local/bin/claude-jail'), '#!/bin/sh\n# stale\n')
    const r = await claudeSandboxStep.run(c)
    expect(r.ok).toBe(true)
    const content = await c.fs.readFile(p('/home/vscode/.local/bin/claude-jail'))
    expect(content).toContain('exec bwrap')
    expect(content).not.toContain('# stale')
  })

  it('is a silent no-op when bwrap is missing', async () => {
    const c = await makeCtx({ withBwrap: false })
    const r = await claudeSandboxStep.run(c)
    expect(r).toEqual({
      ok: true,
      message: expect.stringContaining('bubblewrap not installed'),
    })
    expect(await c.fs.exists(p('/home/vscode/.local/bin/claude-jail'))).toBe(false)
  })

  it('warns and flags the result when user namespaces are blocked', async () => {
    const c = await makeCtx({ usernsBlocked: true })
    const r = await claudeSandboxStep.run(c)
    expect(r.ok).toBe(true)
    // Shim is still on disk so the operator can flip a seccomp policy
    // later without re-running init.
    expect(await c.fs.exists(p('/home/vscode/.local/bin/claude-jail'))).toBe(true)
    if (r.ok) {
      expect(r.message).toMatch(/kernel\/seccomp blocks bwrap/)
    }
    expect(c.logger.has('warn', 'unprivileged user namespaces')).toBe(true)
  })

  it('still installs cleanly when the userns probe succeeds', async () => {
    // Default fake-shell responder returns exit 0 for everything, so
    // this is the happy path. Asserting it explicitly guards against
    // a future change that would warn-by-default.
    const c = await makeCtx()
    const r = await claudeSandboxStep.run(c)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.message).not.toMatch(/seccomp/)
    }
    expect(c.logger.has('warn', 'user namespaces')).toBe(false)
  })
})
