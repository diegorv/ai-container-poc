import { z } from 'zod'
import { operatorPath } from '@/core/security/path'

/**
 * Runtime env. `HOME` is transformed into an `AbsolutePath` brand at
 * parse time so every consumer downstream gets a path-typed value
 * — no `${env.HOME}/.claude` interpolation reaches `fs.*` without
 * having gone through `joinPath`. `passthrough()` keeps unknown keys
 * untyped (and unusable) for forwards-compat.
 */
export const EnvSchema = z
  .object({
    HOME: z
      .string()
      .min(1)
      .transform((v) => operatorPath(v)),
    USER: z.string().optional(),
    TZ: z.string().optional(),
    PATH: z.string().optional(),
    SHELL: z.string().optional(),
    SSH_AUTH_SOCK: z.string().optional(),
    CLAUDE_CODE_OAUTH_TOKEN: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    CLAUDE_CONFIG_DIR: z.string().optional(),
  })
  .passthrough()

export type Env = z.infer<typeof EnvSchema>
