import type { ContractOnion, OnionLayerConfig } from '@harness/protocol'

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
    config: {
      confirmMessage: 'This action requires explicit user confirmation.',
    },
  },
]

export const DEFAULT_ONION_CONTRACT: ContractOnion = {
  version: 1,
  layers: DEFAULT_ONION_LAYERS,
}
