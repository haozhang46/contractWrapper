import { useEffect, useState, type ReactElement } from 'react'

interface MemoryConfig {
  provider: string
  maxEntries: number
  autoRecall: boolean
}

interface MemoryEntry {
  id?: string
  type?: string
  content?: string
}

const DEFAULT: MemoryConfig = {
  provider: 'ccb',
  maxEntries: 200,
  autoRecall: true,
}

export default function MemorySettings(): ReactElement {
  const [config, setConfig] = useState<MemoryConfig | null>(null)
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/memory')
      .then(r => r.json())
      .then(data => setConfig(data.config ?? DEFAULT))
      .catch(() => setConfig(DEFAULT))
    fetch('/api/memory/entries')
      .then(r => r.json())
      .then(data => setEntries(data.entries ?? []))
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

  if (!config) return <p className="text-zinc-500 text-sm">Loading...</p>

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Memory Provider</label>
        <select
          value={config.provider}
          onChange={e => setConfig({ ...config, provider: e.target.value })}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-orange-500/50"
        >
          <option value="ccb">CCB (memdir)</option>
          <option value="json">JSON File (.harness/memory/)</option>
          <option value="none">None</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-zinc-400 mb-1">Max Entries</label>
        <input
          type="number"
          value={config.maxEntries}
          onChange={e =>
            setConfig({ ...config, maxEntries: Number(e.target.value) })
          }
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-orange-500/50"
        />
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs text-zinc-400">Auto-recall in Chat</label>
        <button
          type="button"
          onClick={() => setConfig({ ...config, autoRecall: !config.autoRecall })}
          className={`w-9 h-5 rounded-full transition-colors relative ${config.autoRecall ? 'bg-orange-500' : 'bg-zinc-600'}`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${config.autoRecall ? 'left-4' : 'left-0.5'}`}
          />
        </button>
      </div>

      <div>
        <label className="block text-xs text-zinc-400 mb-1">
          Stored Memories ({entries.length})
        </label>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {entries.length === 0 && (
            <p className="text-zinc-600 text-xs">No memories stored yet</p>
          )}
          {entries.map((e, i) => (
            <div
              key={e.id ?? i}
              className="text-xs bg-zinc-800 rounded px-2 py-1.5 border border-zinc-700/50"
            >
              <span className="text-zinc-500 mr-1">[{e.type}]</span>
              <span className="text-zinc-300">{e.content?.slice(0, 100)}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm rounded-lg transition-colors"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  )
}
