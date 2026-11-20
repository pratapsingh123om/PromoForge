import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  ChevronRight,
  CheckCircle2,
  CircleAlert,
  XCircle,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import type { PageId, ToastNotification } from "../types";

export function Button({
  children,
  variant = "primary",
  className = "",
  disabledReason,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  disabledReason?: string;
}) {
  return (
    <button
      className={`btn btn-${variant} ${className}`}
      disabled={disabled}
      title={disabled && disabledReason ? disabledReason : props.title}
      aria-disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "default",
  icon,
}: {
  children: ReactNode;
  tone?: "default" | "orange" | "green" | "red" | "purple";
  icon?: ReactNode;
}) {
  // Default icons when none provided to ensure status is never communicated by color alone (Section 5)
  const defaultIcon =
    tone === "green" ? (
      <CheckCircle2 size={12} aria-hidden="true" />
    ) : tone === "red" ? (
      <XCircle size={12} aria-hidden="true" />
    ) : tone === "orange" ? (
      <CircleAlert size={12} aria-hidden="true" />
    ) : tone === "purple" ? (
      <Sparkles size={12} aria-hidden="true" />
    ) : null;

  return (
    <span className={`badge badge-${tone}`}>
      {icon ?? defaultIcon}
      <span>{children}</span>
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-content">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Metric({
  label,
  value,
  delta,
  positive = true,
}: {
  label: string;
  value: string;
  delta?: string;
  positive?: boolean;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {delta && (
        <small className={positive ? "metric-delta-positive" : "metric-delta-warning"}>
          {delta}
        </small>
      )}
    </div>
  );
}

export function RowLink({
  title,
  meta,
  onClick,
}: {
  title: string;
  meta: string;
  onClick?: () => void;
}) {
  return (
    <button className="row-link" onClick={onClick}>
      <span>
        <strong>{title}</strong>
        <small>{meta}</small>
      </span>
      <ChevronRight size={16} aria-hidden="true" />
    </button>
  );
}

export function WorkflowBreadcrumb({
  currentPage,
  onNavigate,
}: {
  currentPage: PageId;
  onNavigate: (p: PageId) => void;
}) {
  const steps: { id: PageId; label: string; order: number }[] = [
    { id: "projects", label: "1. Projects", order: 1 },
    { id: "discover", label: "2. Discover", order: 2 },
    { id: "studio", label: "3. Edit (Studio)", order: 3 },
    { id: "campaign", label: "4. Campaign", order: 4 },
    { id: "exports", label: "5. Export", order: 5 },
  ];

  const currentStep = steps.find((s) => s.id === currentPage);

  return (
    <nav className="workflow-nav" aria-label="Editorial workflow sequence">
      <span className="workflow-title">WORKFLOW</span>
      <ol className="workflow-steps">
        {steps.map((step, index) => {
          const isCurrent = step.id === currentPage;
          const isPast = currentStep ? currentStep.order > step.order : false;
          return (
            <li key={step.id} className="workflow-step-item">
              <button
                className={`workflow-step-btn ${isCurrent ? "current" : isPast ? "completed" : ""}`}
                onClick={() => onNavigate(step.id)}
                aria-current={isCurrent ? "step" : undefined}
              >
                {step.label}
              </button>
              {index < steps.length - 1 && (
                <ChevronRight size={13} className="workflow-chevron" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function ToastBanner({
  toast,
  onDismiss,
}: {
  toast: ToastNotification | null;
  onDismiss: () => void;
}) {
  if (!toast) return null;

  return (
    <aside
      className={`toast-banner toast-${toast.type || "info"}`}
      role="status"
      aria-live="polite"
    >
      <div className="toast-content">
        {toast.type === "success" ? (
          <CheckCircle2 size={16} className="toast-icon success" aria-hidden="true" />
        ) : toast.type === "warning" ? (
          <CircleAlert size={16} className="toast-icon warning" aria-hidden="true" />
        ) : (
          <Sparkles size={16} className="toast-icon info" aria-hidden="true" />
        )}
        <span className="toast-text">{toast.message}</span>
      </div>
      <div className="toast-actions">
        {toast.undoAction && (
          <button
            type="button"
            className="toast-undo-btn"
            onClick={() => {
              toast.undoAction?.();
              onDismiss();
            }}
          >
            <Undo2 size={14} aria-hidden="true" />
            <span>Undo</span>
          </button>
        )}
        <button
          type="button"
          className="toast-close-btn"
          onClick={onDismiss}
          aria-label="Dismiss notification"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
