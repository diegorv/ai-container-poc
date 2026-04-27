import { describe, expect, it } from 'vitest'
import {
  DockerInspectContainerArraySchema,
  DockerInspectContainerSchema,
  DockerInspectVolumeArraySchema,
} from './docker-inspect'

describe('DockerInspectContainerSchema', () => {
  it('parses a minimal Docker inspect entry', () => {
    const out = DockerInspectContainerSchema.parse({ Id: 'abc' })
    expect(out.Id).toBe('abc')
  })

  it('preserves passthrough fields the daemon may emit', () => {
    const raw = {
      Id: 'abc',
      Created: '2024-01-01T00:00:00Z',
      HostConfig: { NetworkMode: 'bridge' },
    }
    const out = DockerInspectContainerSchema.parse(raw)
    expect((out as { Created?: string }).Created).toBe('2024-01-01T00:00:00Z')
  })

  it('parses Config.Labels = null (daemon emits this for unlabelled containers)', () => {
    const out = DockerInspectContainerSchema.parse({
      Id: 'abc',
      Config: { Labels: null },
    })
    expect(out.Config?.Labels).toBeNull()
  })

  it('rejects payloads with no Id', () => {
    expect(() => DockerInspectContainerSchema.parse({ Name: '/x' })).toThrow()
  })

  it('rejects non-array top-level for the array variant', () => {
    expect(() => DockerInspectContainerArraySchema.parse({ Id: 'abc' })).toThrow()
  })
})

describe('DockerInspectVolumeArraySchema', () => {
  it('accepts an empty Labels map', () => {
    const out = DockerInspectVolumeArraySchema.parse([{ Name: 'v', Labels: {} }])
    expect(out[0]?.Name).toBe('v')
  })

  it('accepts Labels: null', () => {
    const out = DockerInspectVolumeArraySchema.parse([{ Name: 'v', Labels: null }])
    expect(out[0]?.Labels).toBeNull()
  })

  it('rejects entries with no Name', () => {
    expect(() => DockerInspectVolumeArraySchema.parse([{ Labels: {} }])).toThrow()
  })
})
