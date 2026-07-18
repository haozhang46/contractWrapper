import type { OnionLayer, OnionLayerConfig } from '@harness/protocol'
import { toBuiltinLayer } from '@harness/protocol'
import { initOnionRegistry, onionRegistry } from '../onionSingleton.ts'

export function loadOnion(workspaceRoot: string): void {
  initOnionRegistry(workspaceRoot)
}

export function saveDefaultOnionLayers(layers: OnionLayer[]): void {
  const def = onionRegistry.get('default')
  if (!def) {
    throw new Error('default onion missing')
  }
  onionRegistry.save({ ...def, layers })
}

export function saveOnion(
  _workspaceRoot: string,
  layers: OnionLayerConfig[] | OnionLayer[],
): void {
  const normalized = layers.map(layer =>
    'kind' in layer ? layer : toBuiltinLayer(layer),
  )
  saveDefaultOnionLayers(normalized)
}
