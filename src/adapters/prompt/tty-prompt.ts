import { createInterface } from 'node:readline/promises'
import type { Prompt } from '@/ports/prompt'

/**
 * Real prompt that reads from stdin/stdout. Equivalent to the
 * `read -p ... [y/N]` flow in install.sh.
 */
export const ttyPrompt: Prompt = {
  async confirm(message, options) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const defaultValue = options?.defaultValue ?? false
    const suffix = defaultValue ? '[Y/n]' : '[y/N]'
    try {
      const answer = (await rl.question(`${message} ${suffix} `)).trim().toLowerCase()
      if (answer === '') return defaultValue
      return answer === 'y' || answer === 'yes'
    } finally {
      rl.close()
    }
  },
}
