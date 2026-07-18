import { OnionRegistry } from '@harness/onion'

export let onionRegistry: OnionRegistry

export function initOnionRegistry(workspaceRoot: string): OnionRegistry {
  onionRegistry = new OnionRegistry(workspaceRoot)
  onionRegistry.bootstrap()
  return onionRegistry
}
