import type { AgentSlot, SlotEvent, SlotSessionConfig } from './types.ts'

export function createMockSlot(events: SlotEvent[]): AgentSlot {
  let session: SlotSessionConfig | null = null

  return {
    async initSession(config) {
      session = config
    },
    getSession: () => session,
    abort() {},
    async sendMessageWithHistory(_messages, onEvent) {
      for (const event of events) onEvent(event)
    },
  }
}
