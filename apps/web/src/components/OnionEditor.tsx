import { useEffect, useState, type ReactElement } from 'react'
import type { OnionLayerConfig } from '../types/onion'

export default function OnionEditor(): ReactElement {
  const [layers, setLayers] = useState<OnionLayerConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/onion')
      .then(r => r.json())
      .then(data => {
        setLayers(data.layers ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const save = async (newLayers: OnionLayerConfig[]) => {
    setSaving(true)
    try {
      const res = await fetch('/api/onion', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layers: newLayers }),
      })
      const data = await res.json()
      setLayers(data.layers ?? newLayers)
    } finally {
      setSaving(false)
    }
  }

  const toggleLayer = async (id: string) => {
    const updated = layers.map(l =>
      l.id === id ? { ...l, enabled: !l.enabled } : l,
    )
    setLayers(updated)
    await save(updated)
  }

  const moveLayer = async (id: string, direction: 'up' | 'down') => {
    const idx = layers.findIndex(l => l.id === id)
    if (idx < 0) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= layers.length) return
    const updated = [...layers]
    ;[updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]]
    const reordered = updated.map((l, i) => ({ ...l, priority: i * 10 }))
    setLayers(reordered)
    await save(reordered)
  }

  const deleteLayer = async (id: string) => {
    const layer = layers.find(l => l.id === id)
    if (layer?.type === 'audit') return
    const updated = layers.filter(l => l.id !== id)
    setLayers(updated)
    await save(updated)
  }

  if (loading) {
    return <p className="text-zinc-500 text-sm">Loading...</p>
  }

  return (
    <div className="space-y-2">
      {layers.length === 0 && (
        <p className="text-red-400 text-sm">
          No active layers — all privileged calls will be denied.
        </p>
      )}
      {layers.map((layer, idx) => (
        <div
          key={layer.id}
          className={`flex items-center gap-3 p-3 rounded-lg border ${
            layer.enabled
              ? 'border-zinc-700 bg-zinc-800/50'
              : 'border-zinc-800 bg-zinc-900/30 opacity-60'
          }`}
        >
          <button
            type="button"
            onClick={() => void toggleLayer(layer.id)}
            className={`w-9 h-5 rounded-full transition-colors relative ${
              layer.enabled ? 'bg-orange-500' : 'bg-zinc-600'
            }`}
            aria-label={layer.enabled ? 'Disable layer' : 'Enable layer'}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                layer.enabled ? 'left-4' : 'left-0.5'
              }`}
            />
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{layer.name}</p>
            <p className="text-xs text-zinc-500">
              {layer.type} · priority {layer.priority}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void moveLayer(layer.id, 'up')}
            disabled={idx === 0}
            className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30 text-sm px-1"
            aria-label="Move up"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => void moveLayer(layer.id, 'down')}
            disabled={idx === layers.length - 1}
            className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30 text-sm px-1"
            aria-label="Move down"
          >
            ▼
          </button>

          <button
            type="button"
            onClick={() => void deleteLayer(layer.id)}
            disabled={layer.type === 'audit'}
            className="text-zinc-500 hover:text-red-400 disabled:opacity-30 text-sm"
            aria-label="Delete layer"
          >
            ✕
          </button>
        </div>
      ))}

      {saving && <p className="text-xs text-zinc-500">Saving...</p>}
    </div>
  )
}
