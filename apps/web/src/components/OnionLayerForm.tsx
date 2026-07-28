import { useEffect, useState, type ReactElement } from 'react'
import {
  flattenTools,
  nestTools,
  normalizeGateConfig,
  type ToolRow,
} from '../mappers/capabilityGate'
import {
  CAPABILITY_LEVELS,
  DEFAULT_GATE_CONFIG,
  LAYER_DECISIONS,
  type CapabilityGateConfig,
  type CapabilityLevel,
  type LayerDecision,
} from '../types/onion'

interface OnionLayerFormProps {
  config: Record<string, unknown>
  saving?: boolean
  onSave: (config: CapabilityGateConfig) => void | Promise<void>
  onCancel?: () => void
}

export default function OnionLayerForm({
  config,
  saving = false,
  onSave,
  onCancel,
}: OnionLayerFormProps): ReactElement {
  const [levels, setLevels] = useState(DEFAULT_GATE_CONFIG.levels)
  const [defaultLevel, setDefaultLevel] = useState<CapabilityLevel>(
    DEFAULT_GATE_CONFIG.defaultLevel,
  )
  const [rows, setRows] = useState<ToolRow[]>([])
  const [newToolName, setNewToolName] = useState('')

  useEffect(
    function syncFromConfig() {
      const normalized = normalizeGateConfig(config)
      setLevels(normalized.levels)
      setDefaultLevel(normalized.defaultLevel)
      setRows(flattenTools(normalized.tools))
      setNewToolName('')
    },
    [config],
  )

  const setLevelDecision = (level: CapabilityLevel, decision: LayerDecision) => {
    setLevels(prev => ({ ...prev, [level]: decision }))
  }

  const setRowLevel = (index: number, level: CapabilityLevel) => {
    setRows(prev =>
      prev.map((row, i) => (i === index ? { ...row, level } : row)),
    )
  }

  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  const addTool = () => {
    const name = newToolName.trim()
    if (!name) return
    if (rows.some(r => r.name === name)) return
    setRows(prev => [...prev, { name, level: 'L2' }])
    setNewToolName('')
  }

  const handleSave = () => {
    void onSave({
      levels,
      tools: nestTools(rows),
      defaultLevel,
    })
  }

  return (
    <div className="onion-editor__gate">
      <div className="onion-editor__gate-section">
        <p className="onion-editor__gate-heading">Level decisions</p>
        <div className="onion-editor__gate-levels">
          {CAPABILITY_LEVELS.map(level => (
            <label key={level} className="onion-editor__gate-field">
              <span className="form-field__label">{level}</span>
              <select
                className="form-field__select"
                value={levels[level]}
                onChange={e =>
                  setLevelDecision(level, e.target.value as LayerDecision)
                }
              >
                {LAYER_DECISIONS.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className="onion-editor__gate-section">
        <label className="onion-editor__gate-field">
          <span className="form-field__label">Default level (unlisted tools)</span>
          <select
            className="form-field__select"
            value={defaultLevel}
            onChange={e => setDefaultLevel(e.target.value as CapabilityLevel)}
          >
            {CAPABILITY_LEVELS.map(l => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="onion-editor__gate-section">
        <p className="onion-editor__gate-heading">Tools</p>
        <div className="onion-editor__gate-tools">
          {rows.length === 0 && (
            <p className="onion-editor__gate-empty">No tools listed.</p>
          )}
          {rows.map((row, index) => (
            <div key={`${row.name}-${index}`} className="onion-editor__gate-row">
              <span className="onion-editor__gate-tool-name">{row.name}</span>
              <select
                className="form-field__select onion-editor__gate-row-select"
                value={row.level}
                onChange={e =>
                  setRowLevel(index, e.target.value as CapabilityLevel)
                }
                aria-label={`Level for ${row.name}`}
              >
                {CAPABILITY_LEVELS.map(l => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="onion-editor__delete-btn"
                onClick={() => removeRow(index)}
                aria-label={`Remove ${row.name}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="onion-editor__gate-add">
          <input
            type="text"
            className="form-field__input"
            placeholder="Tool name"
            value={newToolName}
            onChange={e => setNewToolName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTool()
              }
            }}
          />
          <button
            type="button"
            className="onion-editor__edit-btn"
            onClick={addTool}
            disabled={!newToolName.trim()}
          >
            Add
          </button>
        </div>
      </div>

      <div className="onion-editor__gate-actions">
        {onCancel && (
          <button
            type="button"
            className="onion-editor__edit-btn"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          className="form-field__save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
