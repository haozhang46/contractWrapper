import { useEffect, useState, type ReactElement } from 'react'
import {
  disableSkill,
  enableSkill,
  getSkill,
  listSkills,
  skillsRunError,
  type SkillDetail,
  type SkillListItem,
} from './skillsApi'

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

function sourceBadge(skill: SkillListItem): string {
  if (skill.source === 'factory') {
    return skill.zone ? `factory:${skill.zone}` : 'factory'
  }
  return 'runtime'
}

export default function SkillsPanel(): ReactElement {
  const [skills, setSkills] = useState<SkillListItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<{ code?: string; message: string } | null>(
    null,
  )

  async function loadList(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const result = await listSkills()
      if (!result.ok) {
        setError({ code: result.error.code, message: result.error.message })
        return
      }
      setSkills(result.data)
    } catch (err) {
      setError(skillsRunError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadList()
  }, [])

  async function openDetail(id: string): Promise<void> {
    setSelectedId(id)
    setError(null)
    try {
      const result = await getSkill(id)
      if (!result.ok) {
        setError({ code: result.error.code, message: result.error.message })
        setDetail(null)
        return
      }
      setDetail(result.data)
    } catch (err) {
      setError(skillsRunError(err))
      setDetail(null)
    }
  }

  async function toggleEnabled(skill: SkillListItem): Promise<void> {
    if (busyId) return
    setBusyId(skill.id)
    setError(null)
    try {
      const result = skill.enabled
        ? await disableSkill(skill.id)
        : await enableSkill(skill.id, {
            source: skill.source,
            zone: skill.zone,
          })
      if (!result.ok) {
        setError({ code: result.error.code, message: result.error.message })
        return
      }
      setSkills((prev) =>
        prev.map((item) => (item.id === skill.id ? result.data : item)),
      )
      if (selectedId === skill.id) {
        setDetail((prev) => (prev ? { ...prev, ...result.data } : prev))
      }
    } catch (err) {
      setError(skillsRunError(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="settings">
      <h2 className="settings__title">Skills</h2>

      {error ? <ErrorBanner code={error.code} message={error.message} /> : null}

      <section className="settings__section">
        <h3 className="settings__section-title">Catalog</h3>
        {loading ? (
          <p className="form-field__loading">Loading...</p>
        ) : skills.length === 0 ? (
          <p className="form-field__loading">No skills found</p>
        ) : (
          <div className="form-field">
            {skills.map((skill) => (
              <div
                key={`${skill.source}:${skill.id}`}
                className="toggle-setting"
                data-selected={selectedId === skill.id ? 'true' : undefined}
              >
                <button
                  type="button"
                  disabled={busyId === skill.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    void toggleEnabled(skill)
                  }}
                  className={`toggle mt-0.5${skill.enabled ? ' toggle--on' : ' toggle--off'}`}
                  aria-label={
                    skill.enabled
                      ? `Disable ${skill.name}`
                      : `Enable ${skill.name}`
                  }
                >
                  <span
                    className={`toggle__knob${skill.enabled ? ' toggle__knob--on' : ' toggle__knob--off'}`}
                  />
                </button>
                <button
                  type="button"
                  className="toggle-setting__info text-left w-full"
                  onClick={() => void openDetail(skill.id)}
                >
                  <p className="toggle-setting__label">
                    /{skill.name}{' '}
                    <span className="memory-settings__entry-type">
                      [{sourceBadge(skill)}]
                    </span>
                    {skill.installed ? (
                      <span className="memory-settings__entry-type">
                        {' '}
                        installed
                      </span>
                    ) : null}
                  </p>
                  <p className="toggle-setting__desc">
                    {skill.description || 'No description'}
                  </p>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {detail ? (
        <section className="settings__section">
          <h3 className="settings__section-title">
            Detail: /{detail.name}
          </h3>
          <label className="form-field__label">skillMd</label>
          <pre className="form-field__input tool-call__output">{detail.skillMd}</pre>
        </section>
      ) : null}
    </div>
  )
}
