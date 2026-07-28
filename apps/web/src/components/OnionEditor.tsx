import { useEffect, useState, type ReactElement } from 'react'
import type { CapabilityGateConfig, OnionLayerConfig } from '../types/onion'
import { toOnionLayerList } from '../mappers/onion'
import OnionLayerForm from './OnionLayerForm'

export default function OnionEditor(): ReactElement {
  const [layers, setLayers] = useState<OnionLayerConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(function loadOnionLayers() {
    fetch('/api/onion')
      .then(r => r.json())
      .then(data => {
        setLayers(toOnionLayerList(data.layers))
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
      setLayers(toOnionLayerList(data.layers ?? newLayers))
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
    if (expandedId === id) setExpandedId(null)
    await save(updated)
  }

  const saveGateConfig = async (
    id: string,
    config: CapabilityGateConfig,
  ) => {
    const updated = layers.map(l =>
      l.id === id ? { ...l, config: { ...config } } : l,
    )
    setLayers(updated)
    await save(updated)
  }

  if (loading) {
    return <p className="form-field__loading">Loading...</p>
  }

  return (
    <div className="onion-editor">
      {layers.length === 0 && (
        <p className="onion-editor__empty">
          No active layers — all privileged calls will be denied.
        </p>
      )}
      {layers.map((layer, idx) => (
        <div key={layer.id} className="onion-editor__block">
          <div
            className={`onion-editor__layer${layer.enabled ? ' onion-editor__layer--enabled' : ' onion-editor__layer--disabled'}`}
          >
            <button
              type="button"
              onClick={() => void toggleLayer(layer.id)}
              className={`toggle${layer.enabled ? ' toggle--on' : ' toggle--off'}`}
              aria-label={layer.enabled ? 'Disable layer' : 'Enable layer'}
            >
              <span
                className={`toggle__knob${layer.enabled ? ' toggle__knob--on' : ' toggle__knob--off'}`}
              />
            </button>

            <div className="onion-editor__layer-info">
              <p className="onion-editor__layer-name">{layer.name}</p>
              <p className="onion-editor__layer-meta">
                {layer.type} · priority {layer.priority}
              </p>
            </div>

            {layer.type === 'capability-gate' && (
              <button
                type="button"
                className="onion-editor__edit-btn"
                onClick={() =>
                  setExpandedId(expandedId === layer.id ? null : layer.id)
                }
                aria-expanded={expandedId === layer.id}
              >
                {expandedId === layer.id ? 'Close' : 'Edit'}
              </button>
            )}

            <button
              type="button"
              onClick={() => void moveLayer(layer.id, 'up')}
              disabled={idx === 0}
              className="onion-editor__move-btn"
              aria-label="Move up"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => void moveLayer(layer.id, 'down')}
              disabled={idx === layers.length - 1}
              className="onion-editor__move-btn"
              aria-label="Move down"
            >
              ▼
            </button>

            <button
              type="button"
              onClick={() => void deleteLayer(layer.id)}
              disabled={layer.type === 'audit'}
              className="onion-editor__delete-btn"
              aria-label="Delete layer"
            >
              ✕
            </button>
          </div>

          {layer.type === 'capability-gate' && expandedId === layer.id && (
            <OnionLayerForm
              config={layer.config}
              saving={saving}
              onCancel={() => setExpandedId(null)}
              onSave={config => void saveGateConfig(layer.id, config)}
            />
          )}
        </div>
      ))}

      {saving && <p className="onion-editor__saving">Saving...</p>}
    </div>
  )
}
