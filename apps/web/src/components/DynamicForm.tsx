import { useState, type ReactElement } from 'react'

export interface FormField {
  name: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'boolean'
  required?: boolean
  options?: { label: string; value: string }[]
  placeholder?: string
  defaultValue?: string | number | boolean
}

export interface PageSchema {
  form: FormField[]
  request: { method: string; url: string; bodyTemplate?: string }
}

interface DynamicFormProps {
  schema: PageSchema
  onSubmit: (formData: Record<string, unknown>) => void
  submitting?: boolean
}

export default function DynamicForm({ schema, onSubmit, submitting = false }: DynamicFormProps): ReactElement {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {}
    for (const f of schema.form) {
      if (f.defaultValue !== undefined) initial[f.name] = f.defaultValue
      else if (f.type === 'boolean') initial[f.name] = false
      else initial[f.name] = ''
    }
    return initial
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    for (const f of schema.form) {
      if (f.required && (values[f.name] === '' || values[f.name] === undefined)) {
        errs[f.name] = `${f.label} is required`
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) onSubmit(values)
  }

  const setVal = (name: string, value: unknown) => {
    setValues(p => ({ ...p, [name]: value }))
    if (errors[name]) setErrors(p => { const { [name]: _, ...r } = p; return r })
  }

  return (
    <form onSubmit={handleSubmit} className="dynamic-form">
      {schema.form.map(f => (
        <div key={f.name} className="dynamic-form__field">
          <label className="dynamic-form__label">
            {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          {f.type === 'text' && (
            <input type="text" value={String(values[f.name] ?? '')} onChange={e => setVal(f.name, e.target.value)}
              placeholder={f.placeholder} className="dynamic-form__input" disabled={submitting} />
          )}
          {f.type === 'textarea' && (
            <textarea value={String(values[f.name] ?? '')} onChange={e => setVal(f.name, e.target.value)}
              placeholder={f.placeholder} className="dynamic-form__textarea" disabled={submitting} />
          )}
          {f.type === 'number' && (
            <input type="number" value={Number(values[f.name] ?? '')} onChange={e => setVal(f.name, e.target.value === '' ? '' : Number(e.target.value))}
              placeholder={f.placeholder} className="dynamic-form__input" disabled={submitting} />
          )}
          {f.type === 'select' && f.options && (
            <select value={String(values[f.name] ?? '')} onChange={e => setVal(f.name, e.target.value)}
              className="dynamic-form__select" disabled={submitting}>
              {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {f.type === 'boolean' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={Boolean(values[f.name])} onChange={e => setVal(f.name, e.target.checked)}
                className="dynamic-form__checkbox" disabled={submitting} />
              <span>{f.label}</span>
            </label>
          )}
          {errors[f.name] && <p className="dynamic-form__error">{errors[f.name]}</p>}
        </div>
      ))}
      <button type="submit" className="dynamic-form__submit" disabled={submitting}>
        {submitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  )
}
