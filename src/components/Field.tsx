import type { ReactNode } from 'react'

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function Section({
  title,
  children,
  accent,
}: {
  title: string
  children: ReactNode
  accent?: boolean
}) {
  return (
    <section className={`section ${accent ? 'section-accent' : ''}`}>
      <h2 className="section-title">{title}</h2>
      <div className="section-body">{children}</div>
    </section>
  )
}

export function Metric({
  label,
  value,
  note,
  emphasis,
}: {
  label: string
  value: string
  note?: string
  emphasis?: 'positive' | 'negative' | 'neutral'
}) {
  return (
    <div className={`metric ${emphasis ? `metric-${emphasis}` : ''}`}>
      <p className="metric-label">{label}</p>
      <p className="metric-value">
        {value}
        {note ? <span className="metric-note">{note}</span> : null}
      </p>
    </div>
  )
}
