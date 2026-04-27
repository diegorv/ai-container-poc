import { p } from '@/test-utils/path'
import { describe, expect, it } from 'vitest'
import { safeDestPath } from './safe-dest-path'

describe('safeDestPath', () => {
  const base = p('/home/alice/.claude/projects')

  it('accepts a normal path', () => {
    expect(safeDestPath(base, '-devcontainer-foo', 'sess.jsonl')).toBe(
      '/home/alice/.claude/projects/-devcontainer-foo/sess.jsonl',
    )
  })

  it('accepts a nested path inside the key', () => {
    expect(safeDestPath(base, '-devcontainer-foo', 'a/b/c.jsonl')).toBe(
      '/home/alice/.claude/projects/-devcontainer-foo/a/b/c.jsonl',
    )
  })

  it('rejects rest paths with .. that escape the base', () => {
    expect(
      safeDestPath(base, '-devcontainer-foo', '../../../etc/cron.d/evil.jsonl'),
    ).toBeUndefined()
    expect(safeDestPath(base, '-devcontainer-foo', '../sibling/file.jsonl')).toBeUndefined()
  })

  it('rejects when the key is .. or .', () => {
    expect(safeDestPath(base, '..', 'evil.jsonl')).toBeUndefined()
    expect(safeDestPath(base, '.', 'evil.jsonl')).toBeUndefined()
  })

  it('rejects when the key is empty or contains a slash', () => {
    expect(safeDestPath(base, '', 'a.jsonl')).toBeUndefined()
    expect(safeDestPath(base, 'a/b', 'c.jsonl')).toBeUndefined()
    expect(safeDestPath(base, 'a\\b', 'c.jsonl')).toBeUndefined()
  })

  it('rejects when the resolved candidate equals the base (no key/rest)', () => {
    expect(safeDestPath(base, 'foo', '..')).toBeUndefined()
  })

  it('handles absolute restPath by rooting it under the key', () => {
    // path.resolve discards the base when given an absolute path; ensure
    // we reject that since "/etc/passwd" must not escape.
    expect(safeDestPath(base, '-devcontainer-foo', '/etc/passwd')).toBeUndefined()
  })
})
