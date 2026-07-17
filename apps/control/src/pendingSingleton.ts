import { PendingStore } from './pending/store.ts'

export const pendingStore = new PendingStore({ defaultTimeoutMs: 60_000 })
