import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { OnionRegistry } from '../registry.ts'

describe('OnionRegistry', () => {
  let root: string
  beforeEach(() => {
    root = join(tmpdir(), `onion-reg-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(join(root, '.harness'), { recursive: true })
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('bootstrap creates default when empty', () => {
    const reg = new OnionRegistry(root)
    reg.bootstrap()
    expect(existsSync(join(root, '.harness/onions/default.json'))).toBe(true)
    expect(reg.list().some(i => i.isDefault)).toBe(true)
  })

  test('migrates contract-onion.json to onions/default.json', () => {
    writeFileSync(
      join(root, '.harness/contract-onion.json'),
      JSON.stringify({
        version: 1,
        layers: [
          {
            id: 'audit',
            type: 'audit',
            name: 'Audit',
            enabled: true,
            priority: 0,
            config: {},
          },
          {
            id: 'rc',
            type: 'require-confirm',
            name: 'Confirm',
            enabled: true,
            priority: 10,
            config: { tools: ['Bash'] },
          },
        ],
      }),
    )
    const reg = new OnionRegistry(root)
    reg.bootstrap()
    const def = reg.get('default')
    expect(def?.layers.some(l => l.kind === 'builtin' && l.type === 'require-confirm')).toBe(true)
  })

  test('delete default throws', () => {
    const reg = new OnionRegistry(root)
    reg.bootstrap()
    expect(() => reg.delete('default')).toThrow()
  })

  test('evaluate defaults to default onion', async () => {
    const reg = new OnionRegistry(root)
    reg.bootstrap()
    const d = await reg.evaluate('Read', { path: 'x' })
    expect(['allow', 'ask', 'deny']).toContain(d.decision)
  })

  test('unknown onionId falls back to default', async () => {
    const reg = new OnionRegistry(root)
    reg.bootstrap()
    const d = await reg.evaluate('Read', { path: 'x' }, { onionId: 'missing' })
    expect(d.auditTrail.some(e => /unknown onionId|fell back/i.test(e.detail ?? ''))).toBe(true)
  })

  test('save rejects invalid js source', () => {
    const reg = new OnionRegistry(root)
    reg.bootstrap()
    const onion = reg.get('default')!
    expect(() =>
      reg.save({
        ...onion,
        layers: [
          ...onion.layers,
          {
            id: 'bad',
            name: 'Bad',
            enabled: true,
            priority: 99,
            kind: 'js',
            source: '{{{',
          },
        ],
      }),
    ).toThrow()
  })
})
