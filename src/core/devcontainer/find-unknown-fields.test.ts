import { describe, expect, it } from 'vitest'
import { findUnknownTopLevelFields } from './find-unknown-fields'

describe('findUnknownTopLevelFields', () => {
  it('returns [] when all fields are known', () => {
    expect(findUnknownTopLevelFields({ name: 'x', image: 'y', mounts: [], runArgs: [] })).toEqual(
      [],
    )
  })

  it('flags genuinely unknown fields', () => {
    const out = findUnknownTopLevelFields({
      name: 'x',
      mysteryFlag: true,
      futureSpecField: { foo: 'bar' },
    } as unknown as Parameters<typeof findUnknownTopLevelFields>[0])
    expect(out.sort()).toEqual(['futureSpecField', 'mysteryFlag'])
  })

  it('treats common spec fields (forwardPorts, $schema) as known', () => {
    expect(
      findUnknownTopLevelFields({
        name: 'x',
        forwardPorts: [3000],
        $schema: 'https://example.com/schema.json',
      } as unknown as Parameters<typeof findUnknownTopLevelFields>[0]),
    ).toEqual([])
  })
})
