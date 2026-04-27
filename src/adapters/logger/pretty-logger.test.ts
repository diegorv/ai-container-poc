import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPrettyLogger } from './pretty-logger'

describe('pretty-logger', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    writeSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((() => true) as never) as ReturnType<typeof vi.spyOn>
  })

  afterEach(() => {
    writeSpy.mockRestore()
  })

  it('writes plain "[level] msg" lines when color is disabled', () => {
    const logger = createPrettyLogger({ color: false })
    logger.info('hello')
    logger.error('boom')
    expect(writeSpy).toHaveBeenCalledWith('[info] hello\n')
    expect(writeSpy).toHaveBeenCalledWith('[error] boom\n')
  })

  it('writes ANSI-coded lines when color is enabled', () => {
    const logger = createPrettyLogger({ color: true })
    logger.success('done')
    const out = (writeSpy.mock.calls[0]?.[0] ?? '') as string
    expect(out).toContain('\x1b[32m') // green
    expect(out).toContain('done')
    expect(out).toContain('\x1b[0m') // reset
  })

  it('respects the level threshold', () => {
    const logger = createPrettyLogger({ color: false, level: 'warn' })
    logger.info('skip')
    logger.warn('keep')
    expect(writeSpy).not.toHaveBeenCalledWith(expect.stringContaining('skip'))
    expect(writeSpy).toHaveBeenCalledWith('[warn] keep\n')
  })
})
