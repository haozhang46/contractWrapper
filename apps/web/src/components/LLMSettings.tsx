import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { toLLMSettings, type LLMSettingsDTO } from '../mappers/llm'
import type { EndpointMode } from '../types/api'
import { buildRemoteSavePatch, canSaveRemote } from './llmRemoteSave'

const LOCAL_ORIGIN = 'http://127.0.0.1:11434'
const LOCAL_BASE = `${LOCAL_ORIGIN}/v1`
const LOCAL_KEY = 'ollama'

export default function LLMSettings(): ReactElement {
  const [settings, setSettings] = useState<LLMSettingsDTO | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveWarning, setSaveWarning] = useState<string | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)
  const [startingOllama, setStartingOllama] = useState(false)
  const [ollamaStatus, setOllamaStatus] = useState<
    'unknown' | 'running' | 'stopped' | 'starting' | 'error'
  >('unknown')
  const [ollamaStatusMessage, setOllamaStatusMessage] = useState<string | null>(
    null,
  )

  const refreshOllamaStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/llm/ollama/status')
      const body = (await res.json()) as { status?: string }
      setOllamaStatus(body.status === 'running' ? 'running' : 'stopped')
    } catch {
      setOllamaStatus('unknown')
    }
  }, [])

  const loadModels = useCallback(async (origin: string, apiKey?: string) => {
    setLoadingModels(true)
    setModelsError(null)
    try {
      const q = new URLSearchParams({ origin })
      if (apiKey) q.set('apiKey', apiKey)
      const res = await fetch(`/api/llm/ollama/tags?${q}`)
      const body = (await res.json()) as { models?: string[]; error?: string }
      if (!res.ok) {
        setModels([])
        setModelsError(body.error ?? `Failed (${res.status})`)
        return
      }
      const list = body.models ?? []
      setModels(list)
      if (list.length === 0) {
        setModelsError('No models found. Run: ollama pull <model>')
      }
    } catch (e) {
      setModels([])
      setModelsError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingModels(false)
    }
  }, [])

  const startOllama = useCallback(async () => {
    setStartingOllama(true)
    setOllamaStatusMessage(null)
    try {
      const res = await fetch('/api/llm/ollama/start', { method: 'POST' })
      const body = (await res.json()) as {
        status?: string
        message?: string
      }
      setOllamaStatus(
        body.status === 'running' ||
          body.status === 'starting' ||
          body.status === 'error' ||
          body.status === 'stopped'
          ? body.status
          : 'unknown',
      )
      setOllamaStatusMessage(body.message ?? null)
      if (body.status === 'running') {
        await loadModels(LOCAL_ORIGIN, LOCAL_KEY)
      }
    } catch (e) {
      setOllamaStatus('error')
      setOllamaStatusMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setStartingOllama(false)
    }
  }, [loadModels])

  useEffect(function loadLLMSettings() {
    fetch('/api/llm')
      .then(r => r.json())
      .then((data: LLMSettingsDTO) => {
        const next = toLLMSettings(data)
        setSettings(next)
        if (next.endpointMode === 'ollama-local') {
          void refreshOllamaStatus()
        }
      })
      .catch(() => {})
  }, [refreshOllamaStatus])

  const setEndpoint = (mode: EndpointMode) => {
    if (!settings) return
    if (mode === 'ollama-local') {
      setSettings({
        ...settings,
        endpointMode: mode,
        provider: 'openai',
        baseUrl: LOCAL_BASE,
        apiKey: LOCAL_KEY,
      })
      void refreshOllamaStatus()
      void loadModels(LOCAL_ORIGIN, LOCAL_KEY)
      return
    }
    if (mode === 'ollama-remote') {
      setSettings({
        ...settings,
        endpointMode: mode,
        provider: 'openai',
        apiKey: settings.apiKey || LOCAL_KEY,
      })
      return
    }
    setSettings({ ...settings, endpointMode: 'cloud' })
    setModels([])
    setModelsError(null)
  }

  const save = async () => {
    if (!settings) return
    setSaving(true)
    setSaveWarning(null)
    try {
      const body =
        settings.endpointMode === 'ollama-remote'
          ? {
              ...settings,
              ...buildRemoteSavePatch({
                baseUrl: settings.baseUrl,
                model: settings.model,
                apiKey: settings.apiKey,
              }),
            }
          : settings
      const res = await fetch('/api/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) return
      const data = (await res.json()) as LLMSettingsDTO & { warning?: string }
      setSettings(toLLMSettings(data))
      if (typeof data.warning === 'string' && data.warning.length > 0) {
        setSaveWarning(data.warning)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <p className="form-field__loading">Loading...</p>

  const mode = settings.endpointMode ?? 'cloud'
  const remoteSaveInput = {
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKey: settings.apiKey,
  }

  return (
    <div className="form-field">
      <div>
        <label className="form-field__label">Endpoint</label>
        <select
          value={mode}
          onChange={e => setEndpoint(e.target.value as EndpointMode)}
          className="form-field__select"
        >
          <option value="cloud">Cloud</option>
          <option value="ollama-local">Local Ollama</option>
          <option value="ollama-remote">Remote</option>
        </select>
      </div>

      {mode === 'cloud' ? (
        <>
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
              onChange={e =>
                setSettings({ ...settings, model: e.target.value })
              }
              placeholder="deepseek-chat"
              className="form-field__input"
            />
          </div>

          <div>
            <label className="form-field__label">Base URL</label>
            <input
              type="text"
              value={settings.baseUrl}
              onChange={e =>
                setSettings({ ...settings, baseUrl: e.target.value })
              }
              placeholder="https://api.deepseek.com/v1"
              className="form-field__input"
            />
          </div>

          <div>
            <label className="form-field__label">API Key</label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={e =>
                setSettings({ ...settings, apiKey: e.target.value })
              }
              placeholder="sk-..."
              className="form-field__input"
            />
          </div>
        </>
      ) : null}

      {mode === 'ollama-remote' ? (
        <>
          <div>
            <label className="form-field__label">Base URL</label>
            <input
              type="text"
              value={settings.baseUrl}
              onChange={e =>
                setSettings({ ...settings, baseUrl: e.target.value })
              }
              placeholder="http://192.168.1.7:8080/v1/chat/completions"
              className="form-field__input"
            />
          </div>

          <div>
            <label className="form-field__label">Model</label>
            <input
              type="text"
              value={settings.model}
              onChange={e =>
                setSettings({ ...settings, model: e.target.value })
              }
              placeholder="qwen2.5:7b"
              className="form-field__input"
            />
          </div>

          <div>
            <label className="form-field__label">API Key (optional)</label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={e =>
                setSettings({ ...settings, apiKey: e.target.value })
              }
              placeholder="ollama"
              className="form-field__input"
            />
          </div>
        </>
      ) : null}

      {mode === 'ollama-local' ? (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="form-field__save-btn"
            disabled={startingOllama}
            onClick={() => void startOllama()}
          >
            {startingOllama
              ? 'Starting…'
              : ollamaStatus === 'running'
                ? 'Ollama running'
                : 'Start Ollama'}
          </button>
          <button
            type="button"
            className="form-field__save-btn"
            disabled={loadingModels}
            onClick={() => void loadModels(LOCAL_ORIGIN, LOCAL_KEY)}
          >
            {loadingModels ? 'Loading models...' : 'Refresh models'}
          </button>
        </div>
      ) : null}

      {ollamaStatusMessage && mode === 'ollama-local' ? (
        <p className="form-field__hint">{ollamaStatusMessage}</p>
      ) : null}

      {mode === 'ollama-local' ? (
        <div>
          <label className="form-field__label">Model</label>
          {models.length > 0 ? (
            <select
              value={settings.model}
              onChange={e =>
                setSettings({ ...settings, model: e.target.value })
              }
              className="form-field__select"
            >
              {!models.includes(settings.model) ? (
                <option value={settings.model || ''}>
                  {settings.model || 'Select a model'}
                </option>
              ) : null}
              {models.map(name => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={settings.model}
              onChange={e =>
                setSettings({ ...settings, model: e.target.value })
              }
              placeholder="qwen2.5:7b"
              className="form-field__input"
            />
          )}
          {modelsError ? (
            <p className="form-field__hint" style={{ color: 'var(--color-danger, #b33)' }}>
              {modelsError}
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void save()}
        disabled={
          saving ||
          (mode === 'ollama-remote' && !canSaveRemote(remoteSaveInput))
        }
        className={`form-field__save-btn${saved ? ' form-field__save-btn--saved' : ''}`}
      >
        {saving ? 'Saving...' : saved ? 'Saved (slot will reload)' : 'Save'}
      </button>

      {saveWarning ? (
        <p
          className="form-field__hint"
          style={{ color: 'var(--color-danger, #b33)' }}
        >
          Saved, but Claude settings sync failed: {saveWarning}
        </p>
      ) : null}
    </div>
  )
}
