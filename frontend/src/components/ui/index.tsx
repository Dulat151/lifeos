"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, Inbox, Loader2, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- Button */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-ctl)] text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:opacity-90",
        secondary: "bg-surface-2 text-text hover:bg-border",
        outline: "border border-border bg-transparent hover:bg-surface-2",
        ghost: "hover:bg-surface-2 text-text",
        danger: "bg-danger text-white hover:opacity-90",
        link: "text-accent underline-offset-4 hover:underline px-0",
      },
      size: { sm: "h-8 px-3", md: "h-9 px-4", lg: "h-11 px-6 text-base", icon: "h-9 w-9", "icon-sm": "h-7 w-7" },
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
const field = "w-full rounded-[var(--radius-ctl)] border border-border bg-surface px-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, "h-9", className)} {...p} />
));
Input.displayName = "Input";
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, "min-h-[84px] py-2", className)} {...p} />
));
Textarea.displayName = "Textarea";
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(field, "h-9 pr-8", className)} {...p}>{children}</select>
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
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function Switch({ checked, onCheckedChange, label, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <SwitchPrimitive.Root checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label}
        className="relative h-5 w-9 rounded-full bg-border transition-colors data-[state=checked]:bg-accent disabled:opacity-50">
        <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
      {label && <span>{label}</span>}
    </label>
  );
}

/* ---------------------------------------------------------------- Card */
export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow)]", className)} {...p} />;
}
export function CardHeader({ title, action, icon, className }: { title: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-2 px-4 pt-4 pb-2", className)}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</h3>
      {action}
    </div>
  );
}
export function CardBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4", className)} {...p} />;
}

export function Stat({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted">{label}{icon}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

/* ---------------------------------------------------------------- Badge / progress */
const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "bg-surface-2 text-muted", accent: "bg-accent-soft text-accent", success: "bg-success/15 text-success",
      warning: "bg-warning/15 text-warning", danger: "bg-danger/15 text-danger",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export function Badge({ tone, className, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...p} />;
}
export function Progress({ value, className, color }: { value: number; className?: string; color?: string }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${v}%`, background: color }} />
    </div>
  );
}

/* ---------------------------------------------------------------- States */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}
export function LoadingList({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-2" aria-busy="true">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
}
export function EmptyState({ title, text, action, icon }: { title: string; text?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-border px-6 py-10 text-center">
      <div className="text-muted">{icon ?? <Inbox className="size-8" />}</div>
      <p className="font-medium">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Неизвестная ошибка";
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-danger/30 bg-danger/5 px-6 py-8 text-center" role="alert">
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
export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-xl", wide ? "max-w-3xl" : "max-w-lg")}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>
                : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-muted hover:bg-surface-2" aria-label="Закрыть"><X className="size-4" /></DialogPrimitive.Close>
          </div>
          {children}
          {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
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
  return <TabsPrimitive.List className={cn("inline-flex flex-wrap gap-1 rounded-[var(--radius-ctl)] bg-surface-2 p-1", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn("rounded-md px-3 py-1.5 text-sm text-muted data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-sm", className)} {...p} />;
}
export const TabsContent = TabsPrimitive.Content;

/* ---------------------------------------------------------------- Page header */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cn("max-w-sm rounded-[var(--radius-ctl)] border px-4 py-2.5 text-sm shadow-lg bg-surface",
            t.tone === "error" ? "border-danger/40 text-danger" : t.tone === "success" ? "border-success/40" : "border-border")}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => React.useContext(ToastCtx);
