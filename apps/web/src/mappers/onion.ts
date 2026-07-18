import type {
  ApiNamedOnion,
  ApiOnionLayer,
  ApiOnionListItem,
} from '../types/api'
import type {
  NamedOnionDTO,
  OnionLayer,
  OnionLayerType,
  OnionListItem,
} from '../types/onion'

export function toOnionLayer(raw: ApiOnionLayer): OnionLayer {
  if (raw.kind === 'js') {
    return {
      id: raw.id,
      name: raw.name,
      enabled: raw.enabled,
      priority: raw.priority,
      kind: 'js',
      source: raw.source ?? '',
    }
  }
  return {
    id: raw.id,
    name: raw.name,
    enabled: raw.enabled,
    priority: raw.priority,
    kind: 'builtin',
    type: (raw.type ?? 'custom') as OnionLayerType,
    config: raw.config ?? {},
  }
}

export function toOnionLayerList(raw: unknown): OnionLayer[] {
  const list = Array.isArray(raw) ? raw : []
  return list.map(item => toOnionLayer(item as ApiOnionLayer))
}

export function toOnionListItem(raw: ApiOnionListItem): OnionListItem {
  return {
    id: raw.id,
    name: raw.name,
    layerCount: raw.layerCount,
    isDefault: raw.isDefault,
  }
}

export function toOnionListItems(raw: unknown): OnionListItem[] {
  const list = Array.isArray(raw) ? raw : []
  return list.map(item => toOnionListItem(item as ApiOnionListItem))
}

export const toOnionList = toOnionListItems

export function toNamedOnion(raw: ApiNamedOnion): NamedOnionDTO {
  return {
    version: 1,
    id: raw.id,
    name: raw.name,
    layers: toOnionLayerList(raw.layers),
  }
}
