import { z } from 'zod'

export const EnvSchema = z
  .object({
    HOME: z.string().min(1),
    USER: z.string().optional(),
    TZ: z.string().optional(),
    PATH: z.string().optional(),
    SHELL: z.string().optional(),
    CLAUDE_CODE_OAUTH_TOKEN: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    CLAUDE_CONFIG_DIR: z.string().optional(),
  })
  .passthrough()

export type Env = z.infer<typeof EnvSchema>
