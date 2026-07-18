import { describe, expect, test } from 'bun:test'
import { compileJsLayer } from '../compileJsLayer.ts'
import type { OnionEvaluateContext } from '../types.ts'

describe('compileJsLayer', () => {
  test('rejects invalid source', () => {
    expect(() => compileJsLayer('not valid js {{{')).toThrow()
  })

  test('compiles async middleware', async () => {
    const mw = compileJsLayer('async (ctx, next) => { ctx.message = "ok"; await next() }')
    const ctx: OnionEvaluateContext = {
      toolName: 'Read',
      input: {},
      decision: null,
      auditTrail: [],
    }
    await mw(ctx, async () => {
      ctx.decision = 'allow'
    })
    expect(ctx.message).toBe('ok')
    expect(ctx.decision).toBe('allow')
  })
})
