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

  test('bootstrap does not overwrite corrupt default.json', () => {
    const corrupt = '{not valid json'
    mkdirSync(join(root, '.harness/onions'), { recursive: true })
    writeFileSync(join(root, '.harness/onions/default.json'), corrupt)
    const reg = new OnionRegistry(root)
    reg.bootstrap()
    expect(readFileSync(join(root, '.harness/onions/default.json'), 'utf-8')).toBe(corrupt)
    expect(reg.isDefaultCorrupt()).toBe(true)
    expect(reg.get('default')).toBeNull()
  })

  test('evaluate denies when default onion config is corrupt', async () => {
    mkdirSync(join(root, '.harness/onions'), { recursive: true })
    writeFileSync(join(root, '.harness/onions/default.json'), '{not valid json')
    const reg = new OnionRegistry(root)
    reg.bootstrap()
    const d = await reg.evaluate('Read', { path: 'x' })
    expect(d.decision).toBe('deny')
    expect(d.message).toMatch(/corrupt/i)
  })

  test('bootstrap tolerates corrupt contract-onion.json', () => {
    writeFileSync(join(root, '.harness/contract-onion.json'), '{not valid json')
    const reg = new OnionRegistry(root)
    expect(() => reg.bootstrap()).not.toThrow()
    expect(existsSync(join(root, '.harness/onions/default.json'))).toBe(true)
    expect(reg.get('default')).not.toBeNull()
    expect(reg.isDefaultCorrupt()).toBe(false)
  })

  test('corrupt contract-onion.json does not overwrite corrupt default.json', () => {
    const corrupt = '{broken default'
    mkdirSync(join(root, '.harness/onions'), { recursive: true })
    writeFileSync(join(root, '.harness/onions/default.json'), corrupt)
    writeFileSync(join(root, '.harness/contract-onion.json'), '{broken legacy')
    const reg = new OnionRegistry(root)
    reg.bootstrap()
    expect(readFileSync(join(root, '.harness/onions/default.json'), 'utf-8')).toBe(corrupt)
    expect(reg.isDefaultCorrupt()).toBe(true)
  })
})
