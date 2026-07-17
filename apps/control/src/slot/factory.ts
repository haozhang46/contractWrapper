import type { AgentSlot } from '@harness/slot'

let override: AgentSlot | null = null

export function setDefaultSlotForTests(slot: AgentSlot | null): void {
  override = slot
}

export function getDefaultSlot(_workspaceRoot: string): AgentSlot {
  if (override) return override
  throw new Error('Default CcbSlot not wired yet') // Task 4 replaces this
}
