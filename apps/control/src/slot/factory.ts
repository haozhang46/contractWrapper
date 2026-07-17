import type { AgentSlot } from '@harness/slot'
import { CcbSlot } from './ccb-slot.ts'

let override: AgentSlot | null = null

export function setDefaultSlotForTests(slot: AgentSlot | null): void {
  override = slot
}

export function getDefaultSlot(workspaceRoot: string): AgentSlot {
  if (override) return override
  return new CcbSlot({ workspaceRoot })
}
