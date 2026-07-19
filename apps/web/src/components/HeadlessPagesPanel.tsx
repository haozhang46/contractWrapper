import { useState, useEffect, useCallback, type ReactElement } from 'react'
import DynamicForm, { type PageSchema } from './DynamicForm'
import MarkdownRenderer from './MarkdownRenderer'

interface PageMeta { id: string; description: string; pageid: string; hasSchema: boolean }
interface PageResult { status: string; page: string; method: string; url: string; message?: string }

interface BrowseFile {
  path: string
  name: string
  preview: string
}

interface HeadlessPagesPanelProps {
  /** When set, opens the page directly. When null, shows page list. */
  selectedPageId?: string | null
  onPageSelect?: (id: string | null) => void
}

export default function HeadlessPagesPanel({ selectedPageId, onPageSelect }: HeadlessPagesPanelProps): ReactElement | null {
  const [pages, setPages] = useState<PageMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activePage, setActivePage] = useState<PageMeta | null>(null)
  const [schema, setSchema] = useState<PageSchema | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<PageResult | null>(null)
  const [previewFile, setPreviewFile] = useState<Record<string, unknown> | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    fetch('/api/headless/pages')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`Server error: ${r.status}`)))
      .then((data: PageMeta[]) => { if (!cancelled) { setPages(data); setLoading(false) } })
      .catch((err: Error) => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [refreshKey])

  // Sync external selectedPageId
  useEffect(() => {
    if (!selectedPageId) { setActivePage(null); setSchema(null); setResult(null); return }
    const page = pages.find(p => p.id === selectedPageId)
    if (page) setActivePage(page)
  }, [selectedPageId, pages])

  // Load schema when active page changes
  useEffect(() => {
    if (!activePage) { setSchema(null); setResult(null); return }
    let cancelled = false
    setSchemaLoading(true); setSchema(null); setResult(null)
    fetch(`/api/headless/pages/${activePage.id}/schema`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Not found')))
      .then((data: PageSchema) => {
        if (!cancelled) { setSchema(data); setSchemaLoading(false) }
      })
      .catch(() => { if (!cancelled) setSchemaLoading(false) })
    return () => { cancelled = true }
  }, [activePage])

  const readFileFromBrowse = useCallback(async (filePath: string) => {
    setPreviewLoading(true); setPreviewFile(null)
    try {
      const res = await fetch('/api/headless/pages/wiki-read/execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData: { path: filePath } }),
      })
      const data = res.ok ? await res.json() : { error: `Error ${res.status}`, path: filePath }
      setPreviewFile(data)
    } catch (err) {
      setPreviewFile({ error: String(err), path: filePath })
    } finally { setPreviewLoading(false) }
  }, [])

  const handleSubmit = useCallback(async (formData: Record<string, unknown>) => {
    if (!activePage) return
    setSubmitting(true); setResult(null)
    try {
      const res = await fetch(`/api/headless/pages/${activePage.id}/execute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData }),
      })
      setResult(res.ok ? await res.json() : { status: 'error', page: activePage.id, method: '', url: '', message: `Error ${res.status}` })
    } catch (err) {
      setResult({ status: 'error', page: activePage.id, method: '', url: '', message: String(err) })
    } finally { setSubmitting(false) }
  }, [activePage])

  const selectPage = (page: PageMeta) => {
    setActivePage(page); setSchema(null); setResult(null)
    onPageSelect?.(page.id)
  }
  const goBack = () => {
    setActivePage(null); setSchema(null); setResult(null)
    onPageSelect?.(null)
  }

  // List view (shown in sidebar section)
  if (!activePage) {
    if (loading) return <div className="headless-pages"><p className="text-zinc-500 text-sm px-3 py-2">Loading pages...</p></div>
    if (error) return <div className="headless-pages"><p className="text-red-400 text-sm px-3 py-2">{error}</p></div>
    if (pages.length === 0) return null
    return (
      <div className="headless-pages">
        <div className="headless-pages__header">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Pages</span>
          <button type="button" onClick={() => setRefreshKey(k => k + 1)} className="text-xs text-zinc-500 hover:text-zinc-300" title="Refresh">↻</button>
        </div>
        {pages.map(p => (
          <button key={p.id} type="button" onClick={() => selectPage(p)}
            className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700/50 rounded">
            <div className="font-medium">{p.pageid || p.id}</div>
            <div className="text-xs text-zinc-500 truncate">{p.description}</div>
          </button>
        ))}
      </div>
    )
  }

  // ── File preview from browse ────────────────────────────
  if (previewFile) {
    const isMd = previewFile.format === 'markdown'
    const mdContent = isMd ? (previewFile.content as string) ?? '' : ''

    return (
      <div className="headless-pages__main">
        <button type="button" onClick={() => setPreviewFile(null)} className="text-sm text-zinc-400 hover:text-zinc-200 mb-2">
          ← Back to browse results
        </button>
        <h3 className="text-sm font-semibold text-zinc-300 mb-2">
          {previewFile.path as string}
        </h3>
        {isMd ? (
          <>
            <div className="text-xs text-zinc-500 mb-3">
              {(previewFile.size as number) ?? 0} bytes
            </div>
            <div className="wiki-markdown__container">
              <MarkdownRenderer content={mdContent} />
            </div>
          </>
        ) : previewFile.error ? (
          <p className="text-red-400 text-sm">{(previewFile.error as string)}</p>
        ) : (
          <pre className="text-xs bg-zinc-800 p-3 rounded overflow-auto max-h-60">
            {JSON.stringify(previewFile, null, 2)}
          </pre>
        )}
      </div>
    )
  }

  // ── Show result ─────────────────────────────────────────
  if (result) {
    const resultData = result as unknown as Record<string, unknown>
    const isBrowseResult = typeof result === 'object' && result !== null && 'files' in result
    const isMarkdown = resultData.format === 'markdown' || resultData.type === 'markdown'
    const mdContent = isMarkdown ? (resultData.content as string) ?? '' : ''

    // Browse results → render as clickable file list
    if (isBrowseResult) {
      const browseData = result as unknown as { category: string; count: number; files: BrowseFile[] }
      return (
        <div className="headless-pages__main">
          <button type="button" onClick={goBack} className="text-sm text-zinc-400 hover:text-zinc-200 mb-2">← Back</button>
          <h3 className="text-sm font-semibold text-zinc-300 mb-1">Browse: {browseData.category}</h3>
          <p className="text-xs text-zinc-500 mb-3">{browseData.count} article{browseData.count !== 1 ? 's' : ''}</p>
          {previewLoading && (
            <p className="text-sm text-zinc-500 mb-2">Loading file...</p>
          )}
          <div className="wiki-browse__list">
            {browseData.files.map(f => (
              <button key={f.path} type="button" onClick={() => readFileFromBrowse(f.path)}
                className="wiki-browse__item">
                <div className="wiki-browse__item-name">{f.name}</div>
                <div className="wiki-browse__item-preview">{f.preview}</div>
              </button>
            ))}
          </div>
          <button type="button" onClick={goBack} className="mt-3 text-sm text-zinc-400 hover:text-zinc-200">Submit Another</button>
        </div>
      )
    }

    return (
      <div className="headless-pages__main">
        <button type="button" onClick={goBack} className="text-sm text-zinc-400 hover:text-zinc-200 mb-2">← Back</button>
        <h3 className="text-sm font-semibold text-zinc-300 mb-2">Result</h3>
        {isMarkdown ? (
          <>
            <div className="text-xs text-zinc-500 mb-3">
              {(result as unknown as Record<string, unknown>).path as string}
              <span className="mx-1">·</span>
              {(result as unknown as Record<string, string>).size} bytes
            </div>
            <div className="wiki-markdown__container">
              <MarkdownRenderer content={mdContent} />
            </div>
          </>
        ) : (
          <pre className="text-xs bg-zinc-800 p-3 rounded overflow-auto max-h-60">{JSON.stringify(result, null, 2)}</pre>
        )}
        <button type="button" onClick={goBack} className="mt-2 text-sm text-zinc-400 hover:text-zinc-200">Submit Another</button>
      </div>
    )
  }

  if (schemaLoading) return (
    <div className="headless-pages__main">
      <button type="button" onClick={goBack} className="text-sm text-zinc-400 hover:text-zinc-200 mb-2">← Back</button>
      <p className="text-sm text-zinc-500">Loading form...</p>
    </div>
  )

  if (schema) return (
    <div className="headless-pages__main">
      <button type="button" onClick={goBack} className="text-sm text-zinc-400 hover:text-zinc-200 mb-2">← Back</button>
      <h3 className="text-sm font-semibold text-zinc-300 mb-3">{activePage.description}</h3>
      <DynamicForm schema={schema} onSubmit={handleSubmit} submitting={submitting} />
    </div>
  )

  return (
    <div className="headless-pages__main">
      <button type="button" onClick={goBack} className="text-sm text-zinc-400 hover:text-zinc-200 mb-2">← Back</button>
      <p className="text-sm text-zinc-500">This page has no form schema.</p>
    </div>
  )
}
