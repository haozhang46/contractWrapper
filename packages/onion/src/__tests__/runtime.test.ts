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

  // Task 3 will replace require-confirm / migrate coverage.
  test('default gate: Read allows, Bash asks', async () => {
    const rt = new OnionRuntime()
    rt.load(null)
    expect((await rt.evaluate('Read', { path: 'a.ts' })).decision).toBe('allow')
    expect((await rt.evaluate('Bash', { command: 'ls' })).decision).toBe('ask')
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
