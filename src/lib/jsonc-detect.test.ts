import { describe, expect, it } from 'vitest'
import { hasJsoncSyntax } from './jsonc-detect'

describe('hasJsoncSyntax', () => {
  it('returns false for plain JSON', () => {
    expect(hasJsoncSyntax('{"name":"foo","bar":[1,2,3]}')).toBe(false)
    expect(hasJsoncSyntax('{\n  "name": "foo"\n}')).toBe(false)
  })

  it('detects line comments', () => {
    expect(hasJsoncSyntax('{ "a": 1 } // trailing')).toBe(true)
    expect(hasJsoncSyntax('// header\n{ "a": 1 }')).toBe(true)
  })

  it('detects block comments', () => {
    expect(hasJsoncSyntax('/* head */ { "a": 1 }')).toBe(true)
    expect(hasJsoncSyntax('{ "a": /* inline */ 1 }')).toBe(true)
  })

  it('detects trailing commas', () => {
    expect(hasJsoncSyntax('{ "a": 1, }')).toBe(true)
    expect(hasJsoncSyntax('[1, 2, 3, ]')).toBe(true)
    expect(hasJsoncSyntax('{ "a": [1, 2, ], }')).toBe(true)
  })

  it('does not flag a // inside a string literal', () => {
    expect(hasJsoncSyntax('{ "url": "https://example.com" }')).toBe(false)
  })

  it('does not flag a /* inside a string literal', () => {
    expect(hasJsoncSyntax('{ "comment": "this is /* not */ a real comment" }')).toBe(false)
  })

  it('handles escaped quotes inside strings', () => {
    expect(hasJsoncSyntax('{ "msg": "he said \\"hi\\" // wave" }')).toBe(false)
  })

  it('handles trailing comma at end of file', () => {
    expect(hasJsoncSyntax('{\n  "a": 1,\n}\n')).toBe(true)
  })
})
