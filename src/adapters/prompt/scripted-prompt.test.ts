import { describe, expect, it } from 'vitest'
import { createScriptedPrompt } from './scripted-prompt'

describe('scripted-prompt', () => {
  it('returns queued answers in order', async () => {
    const prompt = createScriptedPrompt([true, false])
    expect(await prompt.confirm('one?')).toBe(true)
    expect(await prompt.confirm('two?')).toBe(false)
  })

  it('falls back to defaultValue when queue is empty', async () => {
    const prompt = createScriptedPrompt()
    expect(await prompt.confirm('?')).toBe(false)
    expect(await prompt.confirm('?', { defaultValue: true })).toBe(true)
  })

  it('records all asked messages', async () => {
    const prompt = createScriptedPrompt([true])
    await prompt.confirm('continue?')
    expect(prompt.asked).toEqual(['continue?'])
  })
})
