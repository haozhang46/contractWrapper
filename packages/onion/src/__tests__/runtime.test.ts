import { describe, expect, test } from 'bun:test'
import { OnionRuntime } from '../runtime.ts'
import type { ContractOnion } from '@harness/protocol'

describe('OnionRuntime', () => {
  test('empty non-audit chain denies', async () => {
    const rt = new OnionRuntime()
    const contract: ContractOnion = {
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
      ],
    }
    rt.load(contract)
    const d = await rt.evaluate('Bash', { command: 'ls' })
    expect(d.decision).toBe('deny')
  })

  test('require-confirm yields ask', async () => {
    const rt = new OnionRuntime()
    rt.load({
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
    })
    const d = await rt.evaluate('Bash', { command: 'ls' })
    expect(d.decision).toBe('ask')
  })

  test('L1 capability gate allows unknown tools by default', async () => {
    const rt = new OnionRuntime()
    rt.load(null)
    const d = await rt.evaluate('Read', { path: 'a.ts' })
    expect(['allow', 'ask']).toContain(d.decision)
  })

  test('updateLayers persists for evaluate', async () => {
    const rt = new OnionRuntime()
    rt.updateLayers([
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
    ])
    const d = await rt.evaluate('Bash', {})
    expect(d.decision).toBe('ask')
  })
})
