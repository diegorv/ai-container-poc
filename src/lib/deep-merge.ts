type Plain = Record<string, unknown>

function isPlainObject(value: unknown): value is Plain {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Deep-merges two plain objects. Arrays are replaced (not concatenated),
 * matching the behaviour `jq * `provides for `devcontainer.json` updates
 * in install.sh.
 *
 * Mutation: returns a new object; inputs are not modified.
 */
export function deepMerge<T extends Plain, U extends Plain>(base: T, override: U): T & U {
  const out: Plain = { ...base }
  for (const key of Object.keys(override)) {
    const a = base[key]
    const b = override[key]
    if (isPlainObject(a) && isPlainObject(b)) {
      out[key] = deepMerge(a, b)
    } else {
      out[key] = b
    }
  }
  return out as T & U
}
