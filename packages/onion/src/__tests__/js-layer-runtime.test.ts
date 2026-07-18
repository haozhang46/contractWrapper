import { describe, expect, test } from 'bun:test'
import { OnionRuntime } from '../runtime.ts'
import type { NamedOnion } from '@harness/protocol'

function baseAudit() {
  return {
    id: 'audit',
    name: 'Audit',
    enabled: true,
    priority: 0,
    kind: 'builtin' as const,
    type: 'audit' as const,
    config: {},
  }
}

describe('OnionRuntime js layers', () => {
  test('js layer can allow and rewrite input', async () => {
    const rt = new OnionRuntime()
    const onion: NamedOnion = {
      version: 1,
      id: 'default',
      name: 'Default',
      layers: [
        baseAudit(),
        {
          id: 'js-allow',
          name: 'Allow Bash',
          enabled: true,
          priority: 10,
          kind: 'js',
          source: `async (ctx, next) => {
            if (ctx.toolName === 'Bash') {
              ctx.input = { ...ctx.input, rewritten: true }
              ctx.decision = 'allow'
              return
            }
            await next()
          }`,
        },
      ],
    }
    rt.loadNamed(onion)
    const d = await rt.evaluate('Bash', { command: 'ls' })
    expect(d.decision).toBe('allow')
  })

  test('js layer throw denies with audit', async () => {
    const rt = new OnionRuntime()
    rt.loadNamed({
      version: 1,
      id: 'default',
      name: 'Default',
      layers: [
        baseAudit(),
        {
          id: 'js-boom',
          name: 'Boom',
          enabled: true,
          priority: 10,
          kind: 'js',
          source: `async (ctx, next) => { throw new Error('boom') }`,
        },
      ],
    })
    const d = await rt.evaluate('Bash', {})
    expect(d.decision).toBe('deny')
    expect(d.auditTrail.some(e => e.layerId === 'js-boom')).toBe(true)
  })
})
