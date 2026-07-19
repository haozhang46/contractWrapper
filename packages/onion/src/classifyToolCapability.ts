import type { CapabilityLevel } from '@harness/protocol'

const L1_TOOLS = new Set([
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
])

const L3_TOOLS = new Set([
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
])

/** Fixed capability level for a tool name (L1 read/write, L3 privileged). */
export function classifyToolCapability(toolName: string): CapabilityLevel {
  if (L3_TOOLS.has(toolName)) return 'L3'
  if (L1_TOOLS.has(toolName)) return 'L1'
  return 'L2'
}
