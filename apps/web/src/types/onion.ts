export type OnionLayerType =
  | 'audit'
  | 'capability-gate'
  | 'path-sandbox'
  | 'network-allowlist'
  | 'deny-pattern'
  | 'custom'

export interface OnionLayerConfig {
  id: string
  type: OnionLayerType
  name: string
  enabled: boolean
  priority: number
  config: Record<string, unknown>
}

export type CapabilityLevel = 'L1' | 'L2' | 'L3'

export type LayerDecision = 'allow' | 'ask' | 'deny'

export interface CapabilityGateConfig {
  levels: Record<CapabilityLevel, LayerDecision>
  tools: Record<CapabilityLevel, string[]>
  defaultLevel: CapabilityLevel
}

export const CAPABILITY_LEVELS: CapabilityLevel[] = ['L1', 'L2', 'L3']

export const LAYER_DECISIONS: LayerDecision[] = ['allow', 'ask', 'deny']

/** Factory defaults when gate config fields are missing (mirrors @harness/onion defaultLayers). */
export const DEFAULT_GATE_CONFIG: CapabilityGateConfig = {
  levels: { L1: 'allow', L2: 'ask', L3: 'deny' },
  tools: {
    L1: [
      'FileRead',
      'Read',
      'FileWrite',
      'FileEdit',
      'Glob',
      'Grep',
      'TaskCreate',
      'TaskUpdate',
      'TaskList',
      'TaskGet',
      'EnterPlanMode',
      'ExitPlanModeV2',
    ],
    L2: [
      'Bash',
      'PowerShell',
      'REPL',
      'Agent',
      'WebFetch',
      'WebSearch',
      'CronCreate',
      'CronDelete',
      'Skill',
      'MCP',
      'EnterWorktree',
      'ExitWorktree',
    ],
    L3: [],
  },
  defaultLevel: 'L2',
}
