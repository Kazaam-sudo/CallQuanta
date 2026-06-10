import { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, InputHTMLAttributes } from "react";

export function PageHeader({ title, description, eyebrow, actions }: { title: ReactNode; description?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  return <section className="card hero-card page-header">
    <div>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
    {actions ? <div className="actions">{actions}</div> : null}
  </section>;
}

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`card ${className}`.trim()}>{children}</section>;
}

export function SectionHeader({ title, description, help, actions }: { title: ReactNode; description?: ReactNode; help?: string; actions?: ReactNode }) {
  return <div className="section-header compact-section-header">
    <div>
      <h2>{title} {help ? <HelpTooltip text={help} /> : null}</h2>
      {description ? <small>{description}</small> : null}
    </div>
    {actions ? <div className="actions">{actions}</div> : null}
  </div>;
}

export function Badge({ children, tone = "default", className = "" }: { children: ReactNode; tone?: "default"|"success"|"warning"|"danger"|"info"; className?: string }) {
  return <span className={`badge badge-${tone} ${className}`.trim()}>{children}</span>;
}

export function StatusBadge({ status }: { status?: string | null }) {
  const normalized = status || "unknown";
  return <span className={`badge badge-${normalized}`}>{normalized.replaceAll("_", " ")}</span>;
}

export function Button({ children, variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary"|"secondary"|"danger" }) {
  const variantClass = variant === "secondary" ? "button-secondary" : variant === "danger" ? "button-danger" : "";
  return <button className={`button ${variantClass} ${className}`.trim()} {...props}>{children}</button>;
}

export function Field({ label, help, children }: { label: ReactNode; help?: string; children: ReactNode }) {
  return <label>{label} {help ? <HelpTooltip text={help} /> : null}{children}</label>;
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} />; }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} />; }
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} />; }

export function EmptyState({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return <div className="empty-state"><strong>{title}</strong>{description ? <p>{description}</p> : null}</div>;
}

export function HelpTooltip({ text }: { text: string }) {
  return <span className="help-tooltip">
    <button type="button" className="help-tooltip-trigger" aria-label="Help">?</button>
    <span role="tooltip" className="help-tooltip-content">{text}</span>
  </span>;
}

export function MetricCard({ label, value, help, tone }: { label: ReactNode; value: ReactNode; help?: string; tone?: "danger" }) {
  return <div className={`kpi-card ${tone || ""}`.trim()}><small>{label} {help ? <HelpTooltip text={help} /> : null}</small><strong>{value}</strong></div>;
}

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className="table-wrap"><table className={`data-table ${className}`.trim()}>{children}</table></div>;
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: ReactNode; help?: string }[]; active: string; onChange: (id: string) => void }) {
  return <nav className="subnav" aria-label="Page sections">
    {tabs.map((tab) => <button key={tab.id} type="button" className={active === tab.id ? "active" : ""} onClick={() => onChange(tab.id)} title={tab.help}>{tab.label}</button>)}
  </nav>;
}
