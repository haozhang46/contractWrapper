import type { AgentSlot } from '@harness/slot'
import { CcbSlot } from './ccb-slot.ts'

let override: AgentSlot | null = null
let cached: CcbSlot | null = null
let cachedRoot: string | null = null

export function setDefaultSlotForTests(slot: AgentSlot | null): void {
  override = slot
  if (slot === null) {
    cached?.dispose()
    cached = null
    cachedRoot = null
  }
}

export function getDefaultSlot(workspaceRoot: string): AgentSlot {
  if (override) return override
  if (!cached || cachedRoot !== workspaceRoot) {
    cached?.dispose()
    cached = new CcbSlot({ workspaceRoot })
    cachedRoot = workspaceRoot
  }
  return cached
}

/** Kill the default slot child after LLM settings change; next turn respawns. */
export function bounceDefaultSlot(): void {
  cached?.dispose()
}
