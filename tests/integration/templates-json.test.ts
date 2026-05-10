import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TEMPLATES_DIR = join(REPO_ROOT, 'templates')

/**
 * Anti-regression test: mydevc parses devcontainer.json with strict
 * `JSON.parse()`, not a JSONC parser. The devcontainer spec accepts
 * comments and trailing commas, but our `up`/`info`/`validate`/
 * `template` paths do not — a stray `// comment` in the template
 * surfaces as a confusing "Expected double-quoted property name"
 * runtime error in `mydevc up`. Lock the template down to strict JSON
 * so a future contributor adding a // explanation doesn't break every
 * fresh `mydevc template` run.
 */
describe('templates/*.json must be strict JSON (no JSONC)', () => {
  it('every .json file under templates/ parses with JSON.parse', async () => {
    const entries = await readdir(TEMPLATES_DIR, { withFileTypes: true })
    const jsonFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => e.name)

    expect(jsonFiles.length).toBeGreaterThan(0)

    for (const name of jsonFiles) {
      const path = join(TEMPLATES_DIR, name)
      const raw = await readFile(path, 'utf8')
      // JSON.parse throws on // and /* */ comments and on trailing
      // commas. Failures here mean someone reintroduced JSONC syntax.
      expect(() => JSON.parse(raw), `templates/${name} must be valid JSON`).not.toThrow()
    }
  })
})
