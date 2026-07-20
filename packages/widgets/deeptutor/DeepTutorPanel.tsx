import { useMemo, useState, type ReactElement } from 'react'

const STORAGE_KEY = 'harness.deeptutor.webUrl'
const DEFAULT_URL = 'http://127.0.0.1:3782'

function readStoredUrl(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && v.trim() ? v.trim() : DEFAULT_URL
  } catch {
    return DEFAULT_URL
  }
}

export function DeepTutorPanel(): ReactElement {
  const [urlInput, setUrlInput] = useState(readStoredUrl)
  const [activeUrl, setActiveUrl] = useState(readStoredUrl)
  const [iframeKey, setIframeKey] = useState(0)
  const [loadHint, setLoadHint] = useState(
    'If the frame stays blank, DeepTutor may block embedding — use Open.',
  )

  const normalized = useMemo(() => activeUrl.trim() || DEFAULT_URL, [activeUrl])

  function applyUrl(): void {
    const next = urlInput.trim() || DEFAULT_URL
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
    setActiveUrl(next)
    setIframeKey((k) => k + 1)
    setLoadHint(
      'If the frame stays blank, DeepTutor may block embedding — use Open.',
    )
  }

  function openExternal(): void {
    window.open(normalized, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="settings">
      <h2 className="settings__title">DeepTutor</h2>
      <p className="form-field__loading">{loadHint}</p>
      <section className="settings__section">
        <div className="form-field">
          <label className="form-field__label" htmlFor="deeptutor-url">
            Web URL
          </label>
          <input
            id="deeptutor-url"
            className="form-field__input"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <button type="button" className="form-field__save-btn" onClick={applyUrl}>
            Apply
          </button>
          <button type="button" className="form-field__save-btn" onClick={() => setIframeKey((k) => k + 1)}>
            Refresh
          </button>
          <button type="button" className="form-field__save-btn" onClick={openExternal}>
            Open in new window
          </button>
        </div>
      </section>
      <section className="settings__section" style={{ minHeight: '70vh' }}>
        <iframe
          key={iframeKey}
          title="DeepTutor"
          src={normalized}
          style={{ width: '100%', height: '70vh', border: '1px solid #ccc' }}
          onLoad={() => {
            /* cannot detect X-Frame denial reliably cross-origin; keep hint visible */
          }}
        />
      </section>
    </div>
  )
}
