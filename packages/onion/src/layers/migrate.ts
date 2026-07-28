import type { LayerDecision, OnionLayerConfig } from '@harness/protocol'
import { DEFAULT_ONION_LAYERS } from '../defaultLayers.ts'

const DECISIONS: LayerDecision[] = ['allow', 'ask', 'deny']

function isLayerDecision(v: unknown): v is LayerDecision {
  return typeof v === 'string' && DECISIONS.includes(v as LayerDecision)
}

function isNewLevelsFormat(levels: unknown): boolean {
  if (!levels || typeof levels !== 'object') return false
  const l1 = (levels as Record<string, unknown>).L1
  return isLayerDecision(l1)
}

function defaultGateConfig(): Record<string, unknown> {
  const gate = DEFAULT_ONION_LAYERS.find(l => l.type === 'capability-gate')
  // Deep-copy so migrated layers do not share tools/levels arrays with defaults.
  return gate ? structuredClone(gate.config) : {}
}

function migrateCapabilityGate(layer: OnionLayerConfig): OnionLayerConfig {
  const config = { ...layer.config }
  const defaults = defaultGateConfig()
  const needsLevelsRemap = !isNewLevelsFormat(config.levels)
  const needsTools =
    !config.tools ||
    typeof config.tools !== 'object' ||
    Array.isArray(config.tools)

  if (needsLevelsRemap) {
    config.levels = defaults.levels
  }
  if (needsTools) {
    config.tools = defaults.tools
  }
  if (
    config.defaultLevel !== 'L1' &&
    config.defaultLevel !== 'L2' &&
    config.defaultLevel !== 'L3'
  ) {
    config.defaultLevel = defaults.defaultLevel ?? 'L2'
  }

  return { ...layer, config }
}

/** Strip legacy require-confirm; remap old gate levels/tools to new shape. */
export function migrateOnionLayers(
  layers: OnionLayerConfig[],
): OnionLayerConfig[] {
  return layers
    .filter(l => (l.type as string) !== 'require-confirm')
    .map(l => (l.type === 'capability-gate' ? migrateCapabilityGate(l) : l))
}
