"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, Loader2, Sparkles, X, XCircle } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- Button */
const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-ctl)] text-sm font-medium transition-[background,color,box-shadow,transform,opacity] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg shadow-[var(--shadow-sm)] hover:brightness-110",
        secondary: "bg-surface-2 text-text hover:bg-surface-3",
        outline: "border border-border bg-surface text-text hover:bg-surface-2 hover:border-border-strong",
        ghost: "text-muted hover:bg-surface-2 hover:text-text",
        soft: "bg-accent-soft text-accent hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]",
        danger: "bg-danger text-white hover:brightness-110",
        link: "h-auto px-0 text-accent underline-offset-4 hover:underline active:scale-100",
      },
      size: { xs: "h-7 px-2.5 text-xs", sm: "h-8 px-3", md: "h-9 px-4", lg: "h-11 px-6 text-base", icon: "h-9 w-9", "icon-sm": "h-7 w-7" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
        {asChild ? children : (<>{loading && <Loader2 className="animate-spin" />}{children}</>)}
      </Comp>
    );
  },
);
Button.displayName = "Button";

/* ---------------------------------------------------------------- Inputs */
const field = "w-full rounded-[var(--radius-ctl)] border border-border bg-surface px-3 text-sm text-text placeholder:text-faint transition-[border,box-shadow] hover:border-border-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-[var(--ring)] disabled:opacity-60";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, "h-9", className)} {...p} />
));
Input.displayName = "Input";
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, "min-h-[84px] py-2 leading-relaxed", className)} {...p} />
));
Textarea.displayName = "Textarea";
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(field, "h-9 cursor-pointer pr-8", className)} {...p}>{children}</select>
));
Select.displayName = "Select";

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-muted", className)} {...p} />;
}

export function Field({ label, error, children, className, hint }: { label: string; error?: string; children: React.ReactNode; className?: string; hint?: string }) {
  const autoId = React.useId();
  let id: string | undefined;
  let control = children;
  // Associate the label with a single form control child (accessibility + testability)
  if (React.isValidElement<{ id?: string; "aria-invalid"?: boolean }>(children) && typeof children.type !== "string" || (React.isValidElement(children) && ["input", "select", "textarea"].includes(children.type as string))) {
    const el = children as React.ReactElement<{ id?: string; "aria-invalid"?: boolean }>;
    id = el.props.id ?? autoId;
    control = React.cloneElement(el, { id, "aria-invalid": error ? true : undefined });
  }
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint && !error && <p className="text-xs text-faint">{hint}</p>}
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function Switch({ checked, onCheckedChange, label, disabled, description }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: string; disabled?: boolean; description?: string }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2.5 text-sm", disabled && "cursor-not-allowed opacity-60")}>
      <SwitchPrimitive.Root checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label}
        className="relative h-5 w-9 shrink-0 rounded-full bg-surface-3 transition-colors data-[state=checked]:bg-accent">
        <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
      {(label || description) && <span className="flex flex-col">{label && <span>{label}</span>}{description && <span className="text-xs text-muted">{description}</span>}</span>}
    </label>
  );
}

/** Pill-style single choice (view switchers, periods). */
export function Segmented<T extends string>({ value, onChange, options, className, size = "md", stretch }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string; size?: "sm" | "md"; stretch?: boolean;
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex rounded-[var(--radius-ctl)] bg-surface-2 p-0.5", stretch && "flex w-full [&>button]:flex-1", className)}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("whitespace-nowrap rounded-[8px] font-medium transition-all", size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === o.value ? "bg-surface text-text shadow-[var(--shadow)]" : "text-muted hover:text-text")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Card */
export function Card({ className, interactive, ...p }: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={cn("rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow)]",
    interactive && "transition-[border,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--shadow-lg)]", className)} {...p} />;
}
export function CardHeader({ title, action, icon, className, subtitle }: { title: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode; className?: string; subtitle?: React.ReactNode }) {
  return (
    <div className={cn("flex items-start justify-between gap-2 px-4 pt-4 pb-2.5", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-softer text-accent [&_svg]:size-4">{icon}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
export function CardBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4", className)} {...p} />;
}

export function Stat({ label, value, hint, icon, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-center justify-between text-xs font-medium text-muted">{label}{icon && <span className="text-faint [&_svg]:size-4">{icon}</span>}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

/** Small rounded icon tile used in lists and headers. */
export function IconChip({ children, color, className }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl bg-accent-softer text-accent [&_svg]:size-[18px]", className)}
      style={color ? { background: `color-mix(in srgb, ${color} 14%, transparent)`, color } : undefined}>{children}</span>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn("rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted", className)}>{children}</kbd>;
}

/* ---------------------------------------------------------------- Badge / progress */
const badgeVariants = cva("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium [&_svg]:size-3", {
  variants: {
    tone: {
      neutral: "bg-surface-2 text-muted", accent: "bg-accent-soft text-accent", success: "bg-success/12 text-success",
      warning: "bg-warning/12 text-warning", danger: "bg-danger/12 text-danger", info: "bg-info/12 text-info",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export function Badge({ tone, className, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...p} />;
}
export function Progress({ value, className, color, size = "sm" }: { value: number; className?: string; color?: string; size?: "xs" | "sm" | "md" }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-surface-3/70", size === "xs" ? "h-1" : size === "md" ? "h-2.5" : "h-1.5", className)}
      role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${v}%`, background: color ?? "linear-gradient(90deg, var(--accent), var(--accent-strong))" }} />
    </div>
  );
}

/** Circular progress (level, day progress). */
export function ProgressRing({ value, size = 64, stroke = 6, color, children, className, label }: {
  value: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode; className?: string; label?: string;
}) {
  const v = Math.max(0, Math.min(100, value || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}
      role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color ?? "var(--accent)"} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- States */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-lg", className)} />;
}
export function LoadingList({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-2" aria-busy="true" aria-label="Загрузка">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
}
export function EmptyState({ title, text, action, icon, compact }: { title: string; text?: string; action?: React.ReactNode; icon?: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-border-strong/70 text-center", compact ? "px-4 py-6" : "px-6 py-12")}>
      <div className="mb-1 grid size-11 place-items-center rounded-2xl bg-accent-softer text-accent [&_svg]:size-5">{icon ?? <Sparkles />}</div>
      <p className="font-medium">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Неизвестная ошибка";
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-danger/25 bg-danger/5 px-6 py-8 text-center" role="alert">
      <AlertTriangle className="size-6 text-danger" />
      <p className="text-sm">{msg}</p>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Повторить</Button>}
    </div>
  );
}

/** Renders loading / error / empty / content for a TanStack query result. */
export function QueryState<T>({ q, empty, children, skeleton, isEmpty }: {
  q: { isLoading: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  empty?: React.ReactNode; skeleton?: React.ReactNode; isEmpty?: (d: T) => boolean; children: (d: T) => React.ReactNode;
}) {
  if (q.isLoading) return <>{skeleton ?? <LoadingList />}</>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data === undefined) return null;
  const emptyCheck = isEmpty ?? ((d: T) => (Array.isArray(d) ? d.length === 0 : false));
  if (empty && emptyCheck(q.data)) return <>{empty}</>;
  return <>{children(q.data)}</>;
}

/* ---------------------------------------------------------------- Dialog */
export function Dialog({ open, onOpenChange, title, description, children, footer, wide, className }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-[fade-up_0.2s_both]" />
        <DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[20px] border border-border bg-surface p-5 shadow-[var(--shadow-lg)] focus:outline-none sm:p-6", wide ? "max-w-3xl" : "max-w-lg", className)}>
          <div className="animate-pop">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <DialogPrimitive.Title className="text-base font-semibold tracking-tight">{title}</DialogPrimitive.Title>
                {description ? <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>
                  : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
              </div>
              <DialogPrimitive.Close className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text" aria-label="Закрыть"><X className="size-4" /></DialogPrimitive.Close>
            </div>
            {children}
            {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, text, onConfirm, danger = true, confirmLabel = "Удалить", loading }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; text?: string; onConfirm: () => void; danger?: boolean; confirmLabel?: string; loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={text}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
        <Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <span />
    </Dialog>
  );
}

/* ---------------------------------------------------------------- Tabs */
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex max-w-full flex-wrap gap-0.5 rounded-[var(--radius-ctl)] bg-surface-2 p-0.5", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn("rounded-[8px] px-3 py-1.5 text-sm font-medium text-muted transition-all hover:text-text data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-[var(--shadow)]", className)} {...p} />;
}
export const TabsContent = TabsPrimitive.Content;

/* ---------------------------------------------------------------- Page header */
export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: string; actions?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="hidden size-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent sm:grid [&_svg]:size-5">{icon}</span>}
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Section title inside a page (between card groups). */
export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-2", className)}>
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-faint">{children}</h2>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- Toasts */
type Toast = { id: number; text: string; tone: "success" | "error" | "info" };
const ToastCtx = React.createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const push = React.useCallback((text: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4000);
  }, []);
  const Icon = { success: CheckCircle2, error: XCircle, info: Info };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-20 z-[60] flex flex-col items-end gap-2 lg:bottom-5 lg:right-5 lg:left-auto" aria-live="polite">
        {items.map((t) => {
          const I = Icon[t.tone];
          return (
            <div key={t.id} className="pointer-events-auto flex max-w-sm animate-pop items-start gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3 text-sm shadow-[var(--shadow-lg)]">
              <I className={cn("mt-0.5 size-4 shrink-0", t.tone === "error" ? "text-danger" : t.tone === "success" ? "text-success" : "text-info")} />
              <span>{t.text}</span>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => React.useContext(ToastCtx);
