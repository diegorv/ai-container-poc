/**
 * Test-only path helper. `p('/proj/foo')` is shorthand for
 * `literalPath('/proj/foo')`, used heavily in test fixtures where
 * spelling out `literalPath` per call would be noise. Production
 * code never imports this — it lives under `src/test-utils/`.
 */

import { literalPath } from '@/core/security/path'

/** Brand a literal absolute path as `AbsolutePath`. */
export const p = literalPath
