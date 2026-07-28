import { describe, expect, test } from 'bun:test'
import {
  classifyToolCapability,
  decisionForLevel,
  parseCapabilityGateConfig,
} from '../layers/capabilityGate.ts'
import { DEFAULT_ONION_LAYERS } from '../defaultLayers.ts'

const gate = DEFAULT_ONION_LAYERS.find(l => l.type === 'capability-gate')!
const config = parseCapabilityGateConfig(gate.config)

describe('capabilityGate config', () => {
  test('L1 Read is allow', () => {
    expect(classifyToolCapability('Read', config)).toBe('L1')
    expect(decisionForLevel('L1', config)).toBe('allow')
  })
  test('Bash is L2 ask', () => {
    expect(classifyToolCapability('Bash', config)).toBe('L2')
    expect(decisionForLevel('L2', config)).toBe('ask')
  })
  test('unknown defaults L2', () => {
    expect(classifyToolCapability('TotallyNewTool', config)).toBe('L2')
  })
  test('explicit L3 is deny', () => {
    const withDeny = parseCapabilityGateConfig({
      ...config,
      tools: { ...config.tools, L3: ['Danger'] },
    })
    expect(classifyToolCapability('Danger', withDeny)).toBe('L3')
    expect(decisionForLevel('L3', withDeny)).toBe('deny')
  })
})
