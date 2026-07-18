import type { OnionMiddleware } from './types.ts'

export function compileJsLayer(source: string): OnionMiddleware {
  const trimmed = source.trim()
  if (!trimmed) {
    throw new Error('JS layer source is empty')
  }
  // Function constructor: source must be an expression evaluating to async (ctx, next) => ...
  let fn: unknown
  try {
    fn = new Function(`return (${trimmed})`)()
  } catch (err) {
    throw new Error(
      `JS layer compile failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (typeof fn !== 'function') {
    throw new Error('JS layer source must evaluate to a function')
  }
  return fn as OnionMiddleware
}
