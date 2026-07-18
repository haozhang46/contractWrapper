import { useEffect, useState, type ReactElement } from 'react'
import { toNamedOnion } from '../mappers/onion'
import type { ApiNamedOnion } from '../types/api'
import {
  DEFAULT_JS_LAYER_SOURCE,
  isAuditLayer,
  layerMetaLabel,
  type NamedOnion,
  type OnionLayer,
  type OnionLayerType,
} from '../types/onion'
import OnionLayerForm from './OnionLayerForm'

interface OnionEditorProps {
  onionId: string
  onBack: () => void
}

type AddMode = 'builtin' | 'js' | null

function newLayerId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`
}

export default function OnionEditor({
  onionId,
  onBack,
}: OnionEditorProps): ReactElement {
  const [onion, setOnion] = useState<NamedOnion | null>(null)
  const [name, setName] = useState('')
  const [layers, setLayers] = useState<OnionLayer[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedJsId, setExpandedJsId] = useState<string | null>(null)
  const [addMode, setAddMode] = useState<AddMode>(null)

  useEffect(
    function loadOnion() {
      setLoading(true)
      setError(null)
      fetch(`/api/onions/${encodeURIComponent(onionId)}`)
        .then(async r => {
          const data = (await r.json()) as ApiNamedOnion
          if (!r.ok) {
            throw new Error(data.error ?? 'Failed to load onion')
          }
          return toNamedOnion(data)
        })
        .then(named => {
          setOnion(named)
          setName(named.name)
          setLayers(named.layers)
          setLoading(false)
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Failed to load onion')
          setLoading(false)
        })
    },
    [onionId],
  )

  const save = async (
    nextName: string,
    nextLayers: OnionLayer[],
  ): Promise<boolean> => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/onions/${encodeURIComponent(onionId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          id: onionId,
          name: nextName,
          layers: nextLayers,
        }),
      })
      const data = (await res.json()) as ApiNamedOnion
      if (!res.ok) {
        setError(data.error ?? 'Save failed')
        return false
      }
      const named = toNamedOnion(data)
      setOnion(named)
      setName(named.name)
      setLayers(named.layers)
      return true
    } catch {
      setError('Save failed')
      return false
    } finally {
      setSaving(false)
    }
  }

  const toggleLayer = async (id: string) => {
    const previous = layers
    const updated = layers.map(l =>
      l.id === id ? { ...l, enabled: !l.enabled } : l,
    )
    setLayers(updated)
    const ok = await save(name, updated)
    if (!ok) setLayers(previous)
  }

  const moveLayer = async (id: string, direction: 'up' | 'down') => {
    const idx = layers.findIndex(l => l.id === id)
    if (idx < 0) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= layers.length) return
    const previous = layers
    const updated = [...layers]
    ;[updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]]
    const reordered = updated.map((l, i) => ({ ...l, priority: i * 10 }))
    setLayers(reordered)
    const ok = await save(name, reordered)
    if (!ok) setLayers(previous)
  }

  const deleteLayer = async (id: string) => {
    const layer = layers.find(l => l.id === id)
    if (!layer || isAuditLayer(layer)) return
    const previous = layers
    const updated = layers.filter(l => l.id !== id)
    setLayers(updated)
    if (expandedJsId === id) setExpandedJsId(null)
    const ok = await save(name, updated)
    if (!ok) setLayers(previous)
  }

  const updateJsSource = (id: string, source: string) => {
    setLayers(prev =>
      prev.map(l => (l.id === id && l.kind === 'js' ? { ...l, source } : l)),
    )
  }

  const saveJsLayer = async (id: string) => {
    const layer = layers.find(l => l.id === id)
    if (!layer || layer.kind !== 'js') return
    await save(name, layers)
  }

  const addBuiltinLayer = async (type: OnionLayerType, layerName: string) => {
    const previous = layers
    const layer: OnionLayer = {
      id: newLayerId('builtin'),
      name: layerName,
      enabled: true,
      priority: layers.length * 10,
      kind: 'builtin',
      type,
      config: {},
    }
    const updated = [...layers, layer]
    setLayers(updated)
    const ok = await save(name, updated)
    if (!ok) {
      setLayers(previous)
      return
    }
    setAddMode(null)
  }

  const addJsLayer = async (layerName: string, source: string) => {
    const previous = layers
    const id = newLayerId('js')
    const layer: OnionLayer = {
      id,
      name: layerName,
      enabled: true,
      priority: layers.length * 10,
      kind: 'js',
      source: source || DEFAULT_JS_LAYER_SOURCE,
    }
    const updated = [...layers, layer]
    setLayers(updated)
    setExpandedJsId(id)
    const ok = await save(name, updated)
    if (!ok) {
      setLayers(previous)
      setExpandedJsId(null)
      return
    }
    setAddMode(null)
  }

  const saveName = async () => {
    await save(name, layers)
  }

  if (loading) {
    return <p className="form-field__loading">Loading...</p>
  }

  if (!onion) {
    return (
      <div className="onion-editor">
        <button type="button" onClick={onBack} className="onion-editor__back-btn">
          ← Back
        </button>
        {error && <p className="onion-editor__error">{error}</p>}
      </div>
    )
  }

  return (
    <div className="onion-editor">
      <div className="onion-editor__header">
        <button type="button" onClick={onBack} className="onion-editor__back-btn">
          ← Back
        </button>
        <p className="onion-editor__onion-id">{onion.id}</p>
      </div>

      <div className="onion-editor__name-row">
        <label className="form-field__label" htmlFor="onion-name">
          Name
        </label>
        <div className="onion-editor__name-controls">
          <input
            id="onion-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="form-field__input"
          />
          <button
            type="button"
            onClick={() => void saveName()}
            disabled={saving || name.trim() === onion.name}
            className="form-field__save-btn"
          >
            Save name
          </button>
        </div>
      </div>

      {error && <p className="onion-editor__error">{error}</p>}

      {layers.length === 0 && (
        <p className="onion-editor__empty">
          No active layers — all privileged calls will be denied.
        </p>
      )}

      {layers.map((layer, idx) => (
        <div key={layer.id} className="onion-editor__layer-block">
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
              <p className="onion-editor__layer-meta">{layerMetaLabel(layer)}</p>
            </div>

            {layer.kind === 'js' && (
              <button
                type="button"
                onClick={() =>
                  setExpandedJsId(expandedJsId === layer.id ? null : layer.id)
                }
                className="onion-editor__edit-btn"
              >
                {expandedJsId === layer.id ? 'Hide' : 'Edit'}
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
              disabled={isAuditLayer(layer)}
              className="onion-editor__delete-btn"
              aria-label="Delete layer"
            >
              ✕
            </button>
          </div>

          {layer.kind === 'js' && expandedJsId === layer.id && (
            <div className="onion-editor__js-editor">
              <OnionLayerForm
                mode="edit-js"
                source={layer.source}
                onChange={source => updateJsSource(layer.id, source)}
              />
              <button
                type="button"
                onClick={() => void saveJsLayer(layer.id)}
                disabled={saving}
                className="form-field__save-btn"
              >
                {saving ? 'Saving...' : 'Save JS'}
              </button>
            </div>
          )}
        </div>
      ))}

      {addMode === 'builtin' && (
        <OnionLayerForm
          mode="add-builtin"
          onAdd={(type, layerName) => void addBuiltinLayer(type, layerName)}
          onCancel={() => setAddMode(null)}
        />
      )}

      {addMode === 'js' && (
        <OnionLayerForm
          mode="add-js"
          onAdd={(layerName, source) => void addJsLayer(layerName, source)}
          onCancel={() => setAddMode(null)}
        />
      )}

      {addMode === null && (
        <div className="onion-editor__add">
          <button
            type="button"
            onClick={() => setAddMode('builtin')}
            disabled={saving}
            className="onion-editor__add-btn"
          >
            Add builtin
          </button>
          <button
            type="button"
            onClick={() => setAddMode('js')}
            disabled={saving}
            className="onion-editor__add-btn"
          >
            Add JS layer
          </button>
        </div>
      )}

      {saving && <p className="onion-editor__saving">Saving...</p>}
    </div>
  )
}
