import type { ContractOnion, OnionLayerConfig } from '@harness/protocol'

const L1_TOOLS = [
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
]

const L2_TOOLS = [
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
]

export const DEFAULT_ONION_LAYERS: OnionLayerConfig[] = [
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
      levels: { L1: 'allow', L2: 'ask', L3: 'deny' },
      tools: {
        L1: L1_TOOLS,
        L2: L2_TOOLS,
        L3: [],
      },
      defaultLevel: 'L2',
    },
  },
]

export const DEFAULT_ONION_CONTRACT: ContractOnion = {
  version: 1,
  layers: DEFAULT_ONION_LAYERS,
}
