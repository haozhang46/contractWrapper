import type { ContractOnion, OnionLayer, OnionLayerConfig } from '@harness/protocol'

export const DEFAULT_ONION_LAYERS: OnionLayer[] = [
  {
    id: 'default-audit',
    type: 'audit',
    name: 'Audit Trail',
    enabled: true,
    priority: 0,
    kind: 'builtin',
    config: {},
  },
  {
    id: 'default-capability-gate',
    type: 'capability-gate',
    name: 'Capability Gate',
    enabled: true,
    priority: 10,
    kind: 'builtin',
    config: {
      levels: {
        L1: { autoAllow: true },
        L2: { autoAllow: false },
        L3: { requireConfirm: true },
      },
    },
  },
  {
    id: 'default-require-confirm',
    type: 'require-confirm',
    name: 'Require Confirm (L3)',
    enabled: true,
    priority: 20,
    kind: 'builtin',
    config: {
      confirmMessage: 'This action requires explicit user confirmation.',
    },
  },
]

function toLegacyConfig(layer: OnionLayer): OnionLayerConfig {
  if (layer.kind !== 'builtin') {
    throw new Error(`Cannot convert ${layer.kind} layer to OnionLayerConfig`)
  }
  return {
    id: layer.id,
    type: layer.type,
    name: layer.name,
    enabled: layer.enabled,
    priority: layer.priority,
    config: layer.config,
  }
}

export const DEFAULT_ONION_CONTRACT: ContractOnion = {
  version: 1,
  layers: DEFAULT_ONION_LAYERS.map(toLegacyConfig),
}
