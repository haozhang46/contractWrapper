import { useEffect, useState, type ReactElement } from 'react'
import {
  toMemoryConfig,
  toMemoryEntryList,
  MEMORY_CONFIG_DEFAULT,
  type MemoryConfigDTO,
  type MemoryEntryDTO,
} from '../mappers/memory'

export default function MemorySettings(): ReactElement {
  const [config, setConfig] = useState<MemoryConfigDTO | null>(null)
  const [entries, setEntries] = useState<MemoryEntryDTO[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(function loadMemoryConfig() {
    fetch('/api/memory')
      .then(r => r.json())
      .then(data => setConfig(data.config ? toMemoryConfig(data.config) : MEMORY_CONFIG_DEFAULT))
      .catch(() => setConfig(MEMORY_CONFIG_DEFAULT))
    fetch('/api/memory/entries')
      .then(r => r.json())
      .then(data => setEntries(toMemoryEntryList(data.entries)))
      .catch(() => {})
  }, [])

  const save = async () => {
    if (!config) return
    setSaving(true)
    try {
      await fetch('/api/memory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
    } finally {
      setSaving(false)
    }
  }

  if (!config) return <p className="form-field__loading">Loading...</p>

  return (
    <div className="form-field">
      <div>
        <label className="form-field__label">Memory Provider</label>
        <select
          value={config.provider}
          onChange={e => setConfig({ ...config, provider: e.target.value })}
          className="form-field__select"
        >
          <option value="ccb">CCB (memdir)</option>
          <option value="json">JSON File (.harness/memory/)</option>
          <option value="none">None</option>
        </select>
      </div>

      <div>
        <label className="form-field__label">Max Entries</label>
        <input
          type="number"
          value={config.maxEntries}
          onChange={e =>
            setConfig({ ...config, maxEntries: Number(e.target.value) })
          }
          className="form-field__input"
        />
      </div>

      <div className="inline-toggle">
        <label className="inline-toggle__label">Auto-recall in Chat</label>
        <button
          type="button"
          onClick={() => setConfig({ ...config, autoRecall: !config.autoRecall })}
          className={`toggle${config.autoRecall ? ' toggle--on' : ' toggle--off'}`}
        >
          <span
            className={`toggle__knob${config.autoRecall ? ' toggle__knob--on' : ' toggle__knob--off'}`}
          />
        </button>
      </div>

      <div>
        <label className="form-field__label">
          Stored Memories ({entries.length})
        </label>
        <div className="memory-settings__entries">
          {entries.length === 0 && (
            <p className="memory-settings__entries-empty">No memories stored yet</p>
          )}
          {entries.map((e, i) => (
            <div
              key={e.id ?? i}
              className="memory-settings__entry"
            >
              <span className="memory-settings__entry-type">[{e.type}]</span>
              <span className="memory-settings__entry-content">{e.content?.slice(0, 100)}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="form-field__save-btn"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  )
}
