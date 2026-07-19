import { type ReactElement } from 'react'
import { Formik, Form, Field, type FieldProps, type FormikHelpers } from 'formik'
import {
  applyEffects,
  buildInitialValues,
  buildYupSchema,
  isFieldVisible,
  resolveOptions,
} from './formLinkage'

export type FormOption = { label: string; value: string }

export type FieldCondition = { field: string; equals: unknown }

export interface FormField {
  name: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'boolean'
  required?: boolean
  options?: FormOption[]
  placeholder?: string
  defaultValue?: string | number | boolean
  visibleWhen?: FieldCondition
  optionsFrom?: {
    field: string
    map: Record<string, FormOption[]>
  }
  effects?: Array<{
    when?: FieldCondition
    clear?: string[]
    set?: Record<string, unknown>
  }>
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
  const initialValues = buildInitialValues(schema.form)

  const handleSubmit = (
    values: Record<string, unknown>,
    helpers: FormikHelpers<Record<string, unknown>>,
  ) => {
    onSubmit(values)
    helpers.setSubmitting(false)
  }

  return (
    <Formik
      initialValues={initialValues}
      enableReinitialize
      validate={async (values) => {
        try {
          await buildYupSchema(schema.form, values).validate(values, { abortEarly: false })
          return {}
        } catch (err: unknown) {
          const errors: Record<string, string> = {}
          if (err && typeof err === 'object' && 'inner' in err) {
            const yupErr = err as { inner: Array<{ path?: string; message: string }> }
            for (const e of yupErr.inner) {
              if (e.path && !errors[e.path]) errors[e.path] = e.message
            }
          }
          return errors
        }
      }}
      onSubmit={handleSubmit}
    >
      {({ values, errors, setValues, isSubmitting }) => {
        const disabled = submitting || isSubmitting

        const onFieldChange = (field: FormField, value: unknown) => {
          const merged = { ...values, [field.name]: value }
          const next = applyEffects(field, merged, schema.form)
          void setValues(next)
        }

        return (
          <Form className="dynamic-form">
            {schema.form.map(f => {
              if (!isFieldVisible(f, values)) return null
              const options = resolveOptions(f, values)
              return (
                <div key={f.name} className="dynamic-form__field">
                  {f.type !== 'boolean' && (
                    <label className="dynamic-form__label" htmlFor={f.name}>
                      {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                    </label>
                  )}
                  {f.type === 'text' && (
                    <Field name={f.name}>
                      {({ field }: FieldProps) => (
                        <input
                          id={f.name}
                          type="text"
                          name={field.name}
                          value={String(field.value ?? '')}
                          placeholder={f.placeholder}
                          className="dynamic-form__input"
                          disabled={disabled}
                          onBlur={field.onBlur}
                          onChange={e => onFieldChange(f, e.target.value)}
                        />
                      )}
                    </Field>
                  )}
                  {f.type === 'textarea' && (
                    <Field name={f.name}>
                      {({ field }: FieldProps) => (
                        <textarea
                          id={f.name}
                          name={field.name}
                          value={String(field.value ?? '')}
                          placeholder={f.placeholder}
                          className="dynamic-form__textarea"
                          disabled={disabled}
                          onBlur={field.onBlur}
                          onChange={e => onFieldChange(f, e.target.value)}
                        />
                      )}
                    </Field>
                  )}
                  {f.type === 'number' && (
                    <Field name={f.name}>
                      {({ field }: FieldProps) => (
                        <input
                          id={f.name}
                          type="number"
                          name={field.name}
                          value={field.value === '' || field.value === undefined ? '' : Number(field.value)}
                          placeholder={f.placeholder}
                          className="dynamic-form__input"
                          disabled={disabled}
                          onBlur={field.onBlur}
                          onChange={e => {
                            const v = e.target.value === '' ? '' : Number(e.target.value)
                            onFieldChange(f, v)
                          }}
                        />
                      )}
                    </Field>
                  )}
                  {f.type === 'select' && (
                    <Field name={f.name}>
                      {({ field }: FieldProps) => (
                        <select
                          id={f.name}
                          name={field.name}
                          value={String(field.value ?? '')}
                          className="dynamic-form__select"
                          disabled={disabled}
                          onBlur={field.onBlur}
                          onChange={e => onFieldChange(f, e.target.value)}
                        >
                          {options.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      )}
                    </Field>
                  )}
                  {f.type === 'boolean' && (
                    <Field name={f.name}>
                      {({ field }: FieldProps) => (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            id={f.name}
                            name={field.name}
                            className="dynamic-form__checkbox"
                            disabled={disabled}
                            checked={Boolean(field.value)}
                            onBlur={field.onBlur}
                            onChange={e => onFieldChange(f, e.target.checked)}
                          />
                          <span>{f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}</span>
                        </label>
                      )}
                    </Field>
                  )}
                  {errors[f.name] && <p className="dynamic-form__error">{String(errors[f.name])}</p>}
                </div>
              )
            })}
            <button type="submit" className="dynamic-form__submit" disabled={disabled}>
              {disabled ? 'Submitting...' : 'Submit'}
            </button>
          </Form>
        )
      }}
    </Formik>
  )
}
