import { useEffect, useState, type ReactElement } from 'react'
import { toLLMSettings, type LLMSettingsDTO } from '../mappers/llm'

export default function LLMSettings(): ReactElement {
  const [settings, setSettings] = useState<LLMSettingsDTO | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(function loadLLMSettings() {
    fetch('/api/llm')
      .then(async r => {
        if (!r.ok) throw new Error(`GET /api/llm ${r.status}`)
        return r.json() as Promise<LLMSettingsDTO>
      })
      .then(data => setSettings(toLLMSettings(data)))
      .catch(() =>
        setSettings({
          provider: 'openai',
          model: '',
          baseUrl: '',
          apiKey: '',
        }),
      )
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

  if (!settings) return <p className="form-field__loading">Loading...</p>

  return (
    <div className="form-field">
      <div>
        <label className="form-field__label">Provider</label>
        <select
          value={settings.provider}
          onChange={e =>
            setSettings({ ...settings, provider: e.target.value })
          }
          className="form-field__select"
        >
          <option value="openai">OpenAI Compatible (DeepSeek)</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Gemini</option>
          <option value="grok">Grok</option>
        </select>
      </div>

      <div>
        <label className="form-field__label">Model</label>
        <input
          type="text"
          value={settings.model}
          onChange={e => setSettings({ ...settings, model: e.target.value })}
          placeholder="deepseek-chat"
          className="form-field__input"
        />
      </div>

      <div>
        <label className="form-field__label">Base URL</label>
        <input
          type="text"
          value={settings.baseUrl}
          onChange={e => setSettings({ ...settings, baseUrl: e.target.value })}
          placeholder="https://api.deepseek.com/v1"
          className="form-field__input"
        />
      </div>

      <div>
        <label className="form-field__label">API Key</label>
        <input
          type="password"
          value={settings.apiKey}
          onChange={e => setSettings({ ...settings, apiKey: e.target.value })}
          placeholder="sk-..."
          className="form-field__input"
        />
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className={`form-field__save-btn${saved ? ' form-field__save-btn--saved' : ''}`}
      >
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
      </button>
    </div>
  )
}
