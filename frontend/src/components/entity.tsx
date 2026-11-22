"use client";
/**
 * Config-driven form + list used by modules with plain CRUD semantics.
 * One implementation of validation (Zod), loading/empty/error states, create/edit dialogs and delete confirmation.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button, ConfirmDialog, Dialog, EmptyState, Field, Input, QueryState, Select, Switch, Textarea } from "@/components/ui";
import { useGet, useMut } from "@/hooks/use-api";
import { api, del, patch, post } from "@/lib/api";
import { isoToLocalInput } from "@/lib/utils";

export type FieldDef = {
  name: string; label: string;
  type?: "text" | "textarea" | "number" | "date" | "datetime" | "select" | "checkbox" | "color" | "tags" | "url";
  required?: boolean; options?: { value: string; label: string }[]; min?: number; max?: number; step?: number;
  placeholder?: string; hint?: string; default?: unknown; nullable?: boolean; full?: boolean;
};

function buildSchema(fields: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let s: z.ZodTypeAny;
    switch (f.type) {
      case "number": {
        let n = z.coerce.number({ message: "Введите число" });
        if (f.min !== undefined) n = n.min(f.min, `Минимум ${f.min}`);
        if (f.max !== undefined) n = n.max(f.max, `Максимум ${f.max}`);
        s = f.required ? n : z.union([z.literal(""), n]).optional();
        break;
      }
      case "checkbox": s = z.boolean(); break;
      case "tags": s = z.string().optional(); break;
      case "color": s = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Цвет в формате #RRGGBB"); break;
      case "url": s = f.required ? z.string().url("Некорректная ссылка") : z.union([z.literal(""), z.string().url("Некорректная ссылка")]).optional(); break;
      default: {
        let t = z.string().max(f.type === "textarea" ? 50000 : 300, "Слишком длинно");
        if (f.required) t = t.min(1, "Обязательное поле");
        s = f.required ? t : t.optional();
      }
    }
    shape[f.name] = s;
  }
  return z.object(shape);
}

function toForm(fields: FieldDef[], v: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = v[f.name] ?? f.default;
    if (f.type === "checkbox") out[f.name] = Boolean(raw);
    else if (f.type === "tags") out[f.name] = Array.isArray(raw) ? raw.join(", ") : "";
    else if (f.type === "datetime") out[f.name] = isoToLocalInput(raw as string);
    else if (f.type === "color") out[f.name] = (raw as string) || "#4f6bed";
    else out[f.name] = raw === null || raw === undefined ? "" : String(raw);
  }
  return out;
}

function fromForm(fields: FieldDef[], v: Record<string, unknown>, isEdit: boolean) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = v[f.name];
    if (f.type === "tags") out[f.name] = String(raw || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (f.type === "checkbox") out[f.name] = Boolean(raw);
    else if (raw === "" || raw === undefined) {
      // empty: nullable fields are cleared, plain text becomes "", other fields are left untouched
      if (f.nullable) { if (isEdit || raw === "") out[f.name] = null; }
      else if (!f.type || f.type === "text" || f.type === "textarea") out[f.name] = "";
    }
    else if (f.type === "number") out[f.name] = Number(raw);
    else if (f.type === "datetime") out[f.name] = new Date(raw as string).toISOString();
    else out[f.name] = raw;
  }
  // never send null for required fields
  for (const f of fields) if (f.required && out[f.name] === null) delete out[f.name];
  return out;
}

export function EntityForm({ fields, initial, onSubmit, submitLabel = "Сохранить", busy, id = "entity-form" }: {
  fields: FieldDef[]; initial?: Record<string, unknown>; onSubmit: (v: Record<string, unknown>) => void; submitLabel?: string; busy?: boolean; id?: string;
}) {
  const schema = React.useMemo(() => buildSchema(fields), [fields]);
  const { register, handleSubmit, control, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: toForm(fields, initial) });
  const isEdit = Boolean(initial && (initial as { id?: string }).id);
  return (
    <form id={id} onSubmit={handleSubmit((v) => onSubmit(fromForm(fields, v as Record<string, unknown>, isEdit)))} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
      {fields.map((f) => {
        const err = errors[f.name]?.message as string | undefined;
        const full = f.full || f.type === "textarea" || f.type === "tags";
        const cls = full ? "sm:col-span-2" : "";
        if (f.type === "checkbox") {
          return (
            <div key={f.name} className={cls}>
              <Controller control={control} name={f.name} render={({ field }) => <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} label={f.label} />} />
            </div>
          );
        }
        let control_: React.ReactNode;
        if (f.type === "textarea") control_ = <Textarea placeholder={f.placeholder} {...register(f.name)} />;
        else if (f.type === "select") control_ = (
          <Select {...register(f.name)}>
            {!f.required && <option value="">—</option>}
            {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        );
        else control_ = (
          <Input type={f.type === "datetime" ? "datetime-local" : f.type === "tags" || f.type === "url" ? "text" : f.type || "text"}
            step={f.step} min={f.min} max={f.max} placeholder={f.placeholder ?? (f.type === "tags" ? "через запятую" : undefined)}
            className={f.type === "color" ? "h-9 w-20 p-1" : undefined} {...register(f.name)} />
        );
        return <Field key={f.name} label={f.label + (f.required ? " *" : "")} error={err} hint={f.hint} className={cls}>{control_}</Field>;
      })}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="submit" loading={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}

/** Create / edit dialog for an endpoint. */
export function EntityDialog({ open, onOpenChange, title, fields, endpoint, initial, invalidate, extra, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; fields: FieldDef[]; endpoint: string;
  initial?: Record<string, unknown> & { id?: string }; invalidate: unknown[][]; extra?: Record<string, unknown>; onSaved?: (r: unknown) => void;
}) {
  const save = useMut((v: Record<string, unknown>) => (initial?.id ? patch(`${endpoint}/${initial.id}`, v) : post(endpoint, { ...extra, ...v })),
    { invalidate, success: "Сохранено", onSuccess: (r) => { onOpenChange(false); onSaved?.(r); } });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} wide={fields.length > 6}>
      {open && <EntityForm fields={fields} initial={initial} onSubmit={(v) => save.mutate(v)} busy={save.isPending} />}
    </Dialog>
  );
}

/** Full list + create/edit/delete for a simple resource. */
export function EntityList<T extends { id: string }>({ endpoint, listPath, queryKey, fields, title, render, emptyTitle, emptyText, extra, grid, addLabel = "Добавить" }: {
  endpoint: string; listPath?: string; queryKey: unknown[]; fields: FieldDef[]; title: string; render: (item: T) => React.ReactNode;
  emptyTitle: string; emptyText?: string; extra?: Record<string, unknown>; grid?: boolean; addLabel?: string;
}) {
  const q = useGet<{ items: T[] } | T[]>(queryKey, listPath ?? endpoint);
  const [editing, setEditing] = React.useState<(T & Record<string, unknown>) | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<T | null>(null);
  const remove = useMut((id: string) => del(`${endpoint}/${id}`), { invalidate: [queryKey], success: "Удалено", onSuccess: () => setDeleting(null) });
  const items = (q.data ? (Array.isArray(q.data) ? q.data : q.data.items) : undefined) as T[] | undefined;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button size="sm" onClick={() => setCreating(true)}><Plus />{addLabel}</Button>
      </div>
      <QueryState q={{ ...q, data: items }} empty={<EmptyState title={emptyTitle} text={emptyText} action={<Button size="sm" onClick={() => setCreating(true)}><Plus />{addLabel}</Button>} />}>
        {(list) => (
          <div className={grid ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2"}>
            {list.map((it) => (
              <div key={it.id} className="group relative rounded-[var(--radius-card)] border border-border bg-surface p-3">
                {render(it)}
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Button size="icon-sm" variant="ghost" aria-label="Изменить" onClick={() => setEditing(it as T & Record<string, unknown>)}><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Удалить" onClick={() => setDeleting(it)}><Trash2 /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryState>
      <EntityDialog open={creating} onOpenChange={setCreating} title={addLabel} fields={fields} endpoint={endpoint} invalidate={[queryKey]} extra={extra} />
      <EntityDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Изменить" fields={fields} endpoint={endpoint}
        initial={editing ?? undefined} invalidate={[queryKey]} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Удалить запись?" text="Действие нельзя отменить."
        loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </div>
  );
}

export { api };
