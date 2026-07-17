import type { ApiOnionLayer } from '../types/api'
import type { OnionLayerConfig } from '../types/onion'

export function toOnionLayer(raw: ApiOnionLayer): OnionLayerConfig {
  return {
    id: raw.id,
    type: raw.type as OnionLayerConfig['type'],
    name: raw.name,
    enabled: raw.enabled,
    priority: raw.priority,
    config: raw.config ?? {},
  }
}

export function toOnionLayerList(raw: unknown): OnionLayerConfig[] {
  const list = Array.isArray(raw) ? raw : []
  return list.map(toOnionLayer)
}
