import { describe, expect, test } from 'bun:test'
import {
  type NamedOnion,
  type OnionLayer,
  type AuthorizeRequest,
  toBuiltinLayer,
  isDefaultOnionId,
} from '../index.ts'

describe('NamedOnion protocol', () => {
  test('isDefaultOnionId only true for default', () => {
    expect(isDefaultOnionId('default')).toBe(true)
    expect(isDefaultOnionId('other')).toBe(false)
  })

  test('toBuiltinLayer wraps legacy OnionLayerConfig', () => {
    const layer = toBuiltinLayer({
      id: 'audit',
      type: 'audit',
      name: 'Audit',
      enabled: true,
      priority: 0,
      config: {},
    })
    expect(layer.kind).toBe('builtin')
    if (layer.kind === 'builtin') {
      expect(layer.type).toBe('audit')
    }
  })

  test('NamedOnion accepts js layer', () => {
    const onion: NamedOnion = {
      version: 1,
      id: 'default',
      name: 'Default',
      layers: [
        {
          id: 'js-1',
          name: 'Custom',
          enabled: true,
          priority: 30,
          kind: 'js',
          source: 'async (ctx, next) => { await next() }',
        } satisfies OnionLayer,
      ],
    }
    expect(onion.layers[0]?.kind).toBe('js')
  })

  test('AuthorizeRequest may include onionId', () => {
    const req: AuthorizeRequest = {
      toolName: 'Bash',
      input: {},
      sessionId: 's1',
      onionId: 'strict',
    }
    expect(req.onionId).toBe('strict')
  })
})
