import { useEffect, useState, type ReactElement } from 'react'
import { sfFetch, sfRunError } from './api.ts'

type SkillZone = 'staging' | 'published'

type SkillListItem = { id: string; zone: SkillZone }

type SkillDetail = { id: string; zone: SkillZone; skillMd: string }

type EvalRunResult = { reportPath: string; report: unknown }

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function ErrorBanner({
  code,
  message,
}: {
  code?: string
  message: string
}): ReactElement {
  return (
    <p role="alert" className="form-field__loading">
      {code ? `[${code}] ` : ''}
      {message}
    </p>
  )
}

export function SkillFactoryPanel(): ReactElement {
  const [error, setError] = useState<{ code?: string; message: string } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)

  // Skills
  const [zone, setZone] = useState<SkillZone>('staging')
  const [skills, setSkills] = useState<SkillListItem[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [skillMd, setSkillMd] = useState('')

  // Generate
  const [genId, setGenId] = useState('')
  const [genDesc, setGenDesc] = useState('')
  const [casesSkillId, setCasesSkillId] = useState('')
  const [casesNote, setCasesNote] = useState('')
  const [rubricSkillId, setRubricSkillId] = useState('')
  const [generateResult, setGenerateResult] = useState('')

  // Eval
  const [evalSkillId, setEvalSkillId] = useState('')
  const [evalZone, setEvalZone] = useState<SkillZone | ''>('')
  const [reportPath, setReportPath] = useState('')
  const [evalSummary, setEvalSummary] = useState('')
  const [reportPathA, setReportPathA] = useState('')
  const [reportPathB, setReportPathB] = useState('')
  const [clusterPath, setClusterPath] = useState('')
  const [suggestPath, setSuggestPath] = useState('')
  const [evalExtra, setEvalExtra] = useState('')

  async function run<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T | null> {
    setBusy(true)
    setError(null)
    try {
      const r = await sfFetch<T>(path, init)
      if (!r.ok) {
        setError({ code: r.error.code, message: r.error.message })
        return null
      }
      return r.data
    } catch (err) {
      setError(sfRunError(err))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function loadSkills() {
    const data = await run<SkillListItem[]>('/skills')
    if (data) setSkills(data)
  }

  useEffect(() => {
    void loadSkills()
  }, [])

  const loadSkill = async (id: string, z: SkillZone) => {
    setSelectedId(id)
    const data = await run<SkillDetail>(
      `/skills/${encodeURIComponent(id)}?zone=${encodeURIComponent(z)}`,
    )
    if (data) setSkillMd(data.skillMd)
  }

  const onGenerateSkill = async () => {
    const data = await run<{ id: string; zone: string; paths: string[] }>(
      '/skills/generate',
      {
        method: 'POST',
        body: JSON.stringify({ id: genId, description: genDesc }),
      },
    )
    if (data) {
      setGenerateResult(formatJson(data))
      void loadSkills()
    }
  }

  const onGenerateCases = async () => {
    const data = await run<{ path: string }>('/cases/generate', {
      method: 'POST',
      body: JSON.stringify({ skillId: casesSkillId, note: casesNote }),
    })
    if (data) setGenerateResult(formatJson(data))
  }

  const onGenerateRubric = async () => {
    const data = await run<{ path: string }>('/rubric/generate', {
      method: 'POST',
      body: JSON.stringify({ skillId: rubricSkillId }),
    })
    if (data) setGenerateResult(formatJson(data))
  }

  const onEvalRun = async () => {
    const body: { skillId: string; zone?: SkillZone } = {
      skillId: evalSkillId,
    }
    if (evalZone) body.zone = evalZone
    const data = await run<EvalRunResult>('/eval/run', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (data) {
      setReportPath(data.reportPath)
      setEvalSummary(formatJson(data.report))
      setClusterPath(data.reportPath)
      setSuggestPath(data.reportPath)
    }
  }

  const onReportGet = async () => {
    const data = await run<unknown>(
      `/eval/report?path=${encodeURIComponent(reportPath)}`,
    )
    if (data !== null) setEvalExtra(formatJson(data))
  }

  const onDiff = async () => {
    const data = await run<unknown>('/eval/diff', {
      method: 'POST',
      body: JSON.stringify({ reportPathA, reportPathB }),
    })
    if (data !== null) setEvalExtra(formatJson(data))
  }

  const onCluster = async () => {
    const data = await run<unknown>('/eval/cluster', {
      method: 'POST',
      body: JSON.stringify({ reportPath: clusterPath }),
    })
    if (data !== null) setEvalExtra(formatJson(data))
  }

  const onSuggest = async () => {
    const data = await run<unknown>('/optimize/suggest', {
      method: 'POST',
      body: JSON.stringify({ reportPath: suggestPath }),
    })
    if (data !== null) setEvalExtra(formatJson(data))
  }

  const filtered = skills.filter(s => s.zone === zone)

  return (
    <div className="settings">
      <h2 className="settings__title">Skill Factory</h2>

      {error ? <ErrorBanner code={error.code} message={error.message} /> : null}
      {busy ? <p className="form-field__loading">Working...</p> : null}

      <section className="settings__section">
        <h3 className="settings__section-title">Skills</h3>
        <div className="form-field">
          <div>
            <label className="form-field__label">Zone</label>
            <select
              className="form-field__select"
              value={zone}
              onChange={e => {
                const z = e.target.value as SkillZone
                setZone(z)
                setSkillMd('')
                setSelectedId('')
              }}
            >
              <option value="staging">staging</option>
              <option value="published">published</option>
            </select>
          </div>

          <button
            type="button"
            className="form-field__save-btn"
            onClick={() => void loadSkills()}
          >
            Refresh list
          </button>

          <div>
            <label className="form-field__label">Skill</label>
            <select
              className="form-field__select"
              value={selectedId}
              onChange={e => {
                const id = e.target.value
                if (id) void loadSkill(id, zone)
                else {
                  setSelectedId('')
                  setSkillMd('')
                }
              }}
            >
              <option value="">Select a skill…</option>
              {filtered.map(s => (
                <option key={`${s.zone}:${s.id}`} value={s.id}>
                  {s.id}
                </option>
              ))}
            </select>
          </div>

          {skillMd ? (
            <div>
              <label className="form-field__label">skillMd</label>
              <textarea
                className="form-field__input"
                readOnly
                rows={12}
                value={skillMd}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="settings__section">
        <h3 className="settings__section-title">Generate</h3>
        <div className="form-field">
          <div>
            <label className="form-field__label">skill.generate — id</label>
            <input
              className="form-field__input"
              type="text"
              value={genId}
              onChange={e => setGenId(e.target.value)}
            />
          </div>
          <div>
            <label className="form-field__label">
              skill.generate — description
            </label>
            <textarea
              className="form-field__input"
              rows={3}
              value={genDesc}
              onChange={e => setGenDesc(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="form-field__save-btn"
            onClick={() => void onGenerateSkill()}
          >
            Generate skill
          </button>

          <div>
            <label className="form-field__label">
              cases.generate — skillId
            </label>
            <input
              className="form-field__input"
              type="text"
              value={casesSkillId}
              onChange={e => setCasesSkillId(e.target.value)}
            />
          </div>
          <div>
            <label className="form-field__label">cases.generate — note</label>
            <input
              className="form-field__input"
              type="text"
              value={casesNote}
              onChange={e => setCasesNote(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="form-field__save-btn"
            onClick={() => void onGenerateCases()}
          >
            Generate cases
          </button>

          <div>
            <label className="form-field__label">
              rubric.generate — skillId
            </label>
            <input
              className="form-field__input"
              type="text"
              value={rubricSkillId}
              onChange={e => setRubricSkillId(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="form-field__save-btn"
            onClick={() => void onGenerateRubric()}
          >
            Generate rubric
          </button>

          {generateResult ? (
            <div>
              <label className="form-field__label">Generate result</label>
              <textarea
                className="form-field__input"
                readOnly
                rows={6}
                value={generateResult}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="settings__section">
        <h3 className="settings__section-title">Eval</h3>
        <div className="form-field">
          <div>
            <label className="form-field__label">eval.run — skillId</label>
            <input
              className="form-field__input"
              type="text"
              value={evalSkillId}
              onChange={e => setEvalSkillId(e.target.value)}
            />
          </div>
          <div>
            <label className="form-field__label">eval.run — zone (optional)</label>
            <select
              className="form-field__select"
              value={evalZone}
              onChange={e => setEvalZone(e.target.value as SkillZone | '')}
            >
              <option value="">(default)</option>
              <option value="staging">staging</option>
              <option value="published">published</option>
            </select>
          </div>
          <button
            type="button"
            className="form-field__save-btn"
            onClick={() => void onEvalRun()}
          >
            Run eval
          </button>

          <div>
            <label className="form-field__label">reportPath</label>
            <input
              className="form-field__input"
              type="text"
              value={reportPath}
              onChange={e => setReportPath(e.target.value)}
            />
          </div>
          {evalSummary ? (
            <div>
              <label className="form-field__label">Eval summary</label>
              <textarea
                className="form-field__input"
                readOnly
                rows={8}
                value={evalSummary}
              />
            </div>
          ) : null}

          <button
            type="button"
            className="form-field__save-btn"
            onClick={() => void onReportGet()}
          >
            Get report
          </button>

          <div>
            <label className="form-field__label">diff — reportPathA</label>
            <input
              className="form-field__input"
              type="text"
              value={reportPathA}
              onChange={e => setReportPathA(e.target.value)}
            />
          </div>
          <div>
            <label className="form-field__label">diff — reportPathB</label>
            <input
              className="form-field__input"
              type="text"
              value={reportPathB}
              onChange={e => setReportPathB(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="form-field__save-btn"
            onClick={() => void onDiff()}
          >
            Diff reports
          </button>

          <div>
            <label className="form-field__label">cluster — reportPath</label>
            <input
              className="form-field__input"
              type="text"
              value={clusterPath}
              onChange={e => setClusterPath(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="form-field__save-btn"
            onClick={() => void onCluster()}
          >
            Cluster low scores
          </button>

          <div>
            <label className="form-field__label">suggest — reportPath</label>
            <input
              className="form-field__input"
              type="text"
              value={suggestPath}
              onChange={e => setSuggestPath(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="form-field__save-btn"
            onClick={() => void onSuggest()}
          >
            Optimize suggest
          </button>

          {evalExtra ? (
            <div>
              <label className="form-field__label">Eval / report output</label>
              <textarea
                className="form-field__input"
                readOnly
                rows={10}
                value={evalExtra}
              />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
