import { describe, expect, test } from 'bun:test'
import { OnionRuntime } from '../runtime.ts'
import type { ContractOnion, OnionLayerConfig } from '@harness/protocol'

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

  test('default contract: Bash asks, Read allows, L3 tool denies', async () => {
    const rt = new OnionRuntime()
    rt.load(null)
    expect((await rt.evaluate('Read', {})).decision).toBe('allow')
    expect((await rt.evaluate('Bash', {})).decision).toBe('ask')
    const layers = rt.getLayers().map(l => {
      if (l.type !== 'capability-gate') return l
      return {
        ...l,
        config: {
          ...l.config,
          tools: {
            ...(l.config.tools as object),
            L3: ['Banned'],
          },
        },
      }
    })
    rt.updateLayers(layers)
    expect((await rt.evaluate('Banned', {})).decision).toBe('deny')
  })

  test('migrate strips require-confirm and remaps old levels', async () => {
    const rt = new OnionRuntime()
    const oldLayers = [
      {
        id: 'default-audit',
        type: 'audit',
        name: 'Audit Trail',
        enabled: true,
        priority: 0,
        config: {},
      },
      {
        id: 'default-capability-gate',
        type: 'capability-gate',
        name: 'Capability Gate',
        enabled: true,
        priority: 10,
        config: {
          levels: {
            L1: { autoAllow: true },
            L2: { autoAllow: false },
            L3: { requireConfirm: true },
          },
        },
      },
      {
        id: 'default-require-confirm',
        type: 'require-confirm',
        name: 'Require Confirm (L3)',
        enabled: true,
        priority: 20,
        config: {
          confirmMessage: 'This action requires explicit user confirmation.',
        },
      },
    ] as OnionLayerConfig[]

    rt.load({ version: 1, layers: oldLayers })

    expect(rt.getLayers().some(l => (l.type as string) === 'require-confirm')).toBe(
      false,
    )
    const gate = rt.getLayers().find(l => l.type === 'capability-gate')!
    expect(gate.config.levels).toEqual({
      L1: 'allow',
      L2: 'ask',
      L3: 'deny',
    })
    expect(Array.isArray((gate.config.tools as { L2: string[] }).L2)).toBe(true)
    expect((gate.config.tools as { L2: string[] }).L2).toContain('Bash')
    expect((await rt.evaluate('Bash', {})).decision).toBe('ask')
    expect((await rt.evaluate('Read', {})).decision).toBe('allow')
    expect(rt.classify('Bash')).toBe('L2')
    expect(rt.classify('Read')).toBe('L1')
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
        id: 'gate',
        type: 'capability-gate',
        name: 'Gate',
        enabled: true,
        priority: 10,
        config: {
          levels: { L1: 'allow', L2: 'ask', L3: 'deny' },
          tools: { L1: [], L2: ['Bash'], L3: [] },
          defaultLevel: 'L2',
        },
      },
    ])
    const d = await rt.evaluate('Bash', {})
    expect(d.decision).toBe('ask')
  })
})
