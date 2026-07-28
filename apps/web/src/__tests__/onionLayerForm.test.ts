import { describe, expect, test } from 'bun:test'
import {
  flattenTools,
  nestTools,
  normalizeGateConfig,
} from '../mappers/capabilityGate'
import { DEFAULT_GATE_CONFIG } from '../types/onion'

describe('capabilityGate mappers', () => {
  test('normalizeGateConfig fills factory defaults when fields missing', () => {
    const normalized = normalizeGateConfig({})
    expect(normalized.levels).toEqual(DEFAULT_GATE_CONFIG.levels)
    expect(normalized.defaultLevel).toBe('L2')
    expect(normalized.tools.L1).toContain('Read')
    expect(normalized.tools.L2).toContain('Bash')
    expect(normalized.tools.L3).toEqual([])
  })

  test('normalizeGateConfig keeps existing tools and decisions', () => {
    const normalized = normalizeGateConfig({
      levels: { L1: 'deny', L2: 'allow', L3: 'ask' },
      tools: { L1: ['Read'], L2: [], L3: ['Bash'] },
      defaultLevel: 'L3',
    })
    expect(normalized.levels.L1).toBe('deny')
    expect(normalized.defaultLevel).toBe('L3')
    expect(normalized.tools).toEqual({
      L1: ['Read'],
      L2: [],
      L3: ['Bash'],
    })
  })

  test('flattenTools + nestTools round-trip and drop duplicates', () => {
    const tools = {
      L1: ['Read', 'Glob'],
      L2: ['Bash', 'Read'],
      L3: ['Danger'],
    }
    const rows = flattenTools(tools)
    expect(rows).toEqual([
      { name: 'Read', level: 'L1' },
      { name: 'Glob', level: 'L1' },
      { name: 'Bash', level: 'L2' },
      { name: 'Danger', level: 'L3' },
    ])
    expect(nestTools(rows)).toEqual({
      L1: ['Read', 'Glob'],
      L2: ['Bash'],
      L3: ['Danger'],
    })
  })
})
