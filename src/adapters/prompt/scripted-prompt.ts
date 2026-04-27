import type { Prompt } from '@/ports/prompt'

export interface ScriptedPrompt extends Prompt {
  readonly asked: readonly string[]
  /** Push another scripted answer onto the queue. */
  enqueue(answer: boolean): void
}

/**
 * Test double for `Prompt`. Answers come from a queue (FIFO); when the
 * queue is empty, the default value is used.
 */
export function createScriptedPrompt(answers: boolean[] = []): ScriptedPrompt {
  const queue = [...answers]
  const asked: string[] = []
  return {
    asked,
    enqueue(answer) {
      queue.push(answer)
    },
    async confirm(message, options) {
      asked.push(message)
      if (queue.length > 0) return queue.shift() as boolean
      return options?.defaultValue ?? false
    },
  }
}
