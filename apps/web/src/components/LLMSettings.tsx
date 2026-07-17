import { useEffect, useState, type ReactElement } from 'react'

interface LLMSettingsData {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
}

export default function LLMSettings(): ReactElement {
  const [settings, setSettings] = useState<LLMSettingsData | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/llm')
      .then(r => r.json())
      .then(data => setSettings(data))
      .catch(() => {})
  }, [])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await fetch('/api/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <p className="text-zinc-500 text-sm">Loading...</p>

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Provider</label>
        <select
          value={settings.provider}
          onChange={e =>
            setSettings({ ...settings, provider: e.target.value })
          }
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-orange-500/50"
        >
          <option value="openai">OpenAI Compatible (DeepSeek)</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Gemini</option>
          <option value="grok">Grok</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-zinc-400 mb-1">Model</label>
        <input
          type="text"
          value={settings.model}
          onChange={e => setSettings({ ...settings, model: e.target.value })}
          placeholder="deepseek-chat"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-orange-500/50"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-400 mb-1">Base URL</label>
        <input
          type="text"
          value={settings.baseUrl}
          onChange={e => setSettings({ ...settings, baseUrl: e.target.value })}
          placeholder="https://api.deepseek.com/v1"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-orange-500/50"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-400 mb-1">API Key</label>
        <input
          type="password"
          value={settings.apiKey}
          onChange={e => setSettings({ ...settings, apiKey: e.target.value })}
          placeholder="sk-..."
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-orange-500/50"
        />
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          saved
            ? 'bg-green-600 text-white'
            : 'bg-orange-600 hover:bg-orange-500 text-white'
        }`}
      >
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
      </button>
    </div>
  )
}
