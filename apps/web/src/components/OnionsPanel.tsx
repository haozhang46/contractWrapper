import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { toOnionList } from '../mappers/onion'
import type { ApiOnionsListResponse } from '../types/api'
import type { OnionListItem } from '../types/onion'
import OnionEditor from './OnionEditor'

export default function OnionsPanel(): ReactElement {
  const [onions, setOnions] = useState<OnionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const loadList = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/onions')
      const data = (await res.json()) as ApiOnionsListResponse & { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Failed to load onions')
        return
      }
      setOnions(toOnionList(data.onions))
    } catch {
      setError('Failed to load onions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(function loadOnions() {
    void loadList()
  }, [loadList])

  const createOnion = async (e: FormEvent) => {
    e.preventDefault()
    const id = newId.trim()
    if (!id || creating) return
    setCreating(true)
    setError(null)
    try {
      const body: { id: string; name?: string } = { id }
      if (newName.trim()) body.name = newName.trim()
      const res = await fetch('/api/onions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { error?: string; id?: string }
      if (!res.ok) {
        setError(data.error ?? 'Failed to create onion')
        return
      }
      setShowNew(false)
      setNewId('')
      setNewName('')
      await loadList()
      if (data.id) setSelectedId(data.id)
    } catch {
      setError('Failed to create onion')
    } finally {
      setCreating(false)
    }
  }

  const deleteOnion = async (item: OnionListItem) => {
    if (item.isDefault) return
    if (!window.confirm(`Delete onion "${item.name}" (${item.id})?`)) return
    setError(null)
    try {
      const res = await fetch(`/api/onions/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 204) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? 'Failed to delete onion')
        return
      }
      if (selectedId === item.id) setSelectedId(null)
      await loadList()
    } catch {
      setError('Failed to delete onion')
    }
  }

  if (selectedId) {
    return (
      <OnionEditor
        onionId={selectedId}
        onBack={() => {
          setSelectedId(null)
          void loadList()
        }}
      />
    )
  }

  if (loading) {
    return <p className="form-field__loading">Loading...</p>
  }

  return (
    <div className="onions-panel">
      {error && <p className="onions-panel__error">{error}</p>}

      <ul className="onions-panel__list">
        {onions.map(item => (
          <li key={item.id} className="onions-panel__item">
            <button
              type="button"
              className="onions-panel__item-main"
              onClick={() => setSelectedId(item.id)}
            >
              <span className="onions-panel__item-name">{item.name}</span>
              <span className="onions-panel__item-meta">
                {item.id}
                {item.isDefault ? ' · default' : ''} · {item.layerCount} layer
                {item.layerCount === 1 ? '' : 's'}
              </span>
            </button>
            <button
              type="button"
              className="onions-panel__delete-btn"
              disabled={item.isDefault}
              onClick={() => void deleteOnion(item)}
              aria-label={`Delete ${item.name}`}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {onions.length === 0 && (
        <p className="onions-panel__empty">No onions found.</p>
      )}

      {showNew ? (
        <form className="onions-panel__new-form" onSubmit={e => void createOnion(e)}>
          <div>
            <label className="form-field__label" htmlFor="new-onion-id">
              Id
            </label>
            <input
              id="new-onion-id"
              type="text"
              value={newId}
              onChange={e => setNewId(e.target.value)}
              placeholder="my-onion"
              className="form-field__input"
              pattern="[a-zA-Z0-9_-]+"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="form-field__label" htmlFor="new-onion-name">
              Name (optional)
            </label>
            <input
              id="new-onion-name"
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Defaults to id"
              className="form-field__input"
            />
          </div>
          <div className="onions-panel__new-actions">
            <button
              type="submit"
              disabled={creating || !newId.trim()}
              className="form-field__save-btn"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              className="onions-panel__cancel-btn"
              onClick={() => {
                setShowNew(false)
                setNewId('')
                setNewName('')
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="onions-panel__new-btn"
          onClick={() => setShowNew(true)}
        >
          New onion
        </button>
      )}
    </div>
  )
}
