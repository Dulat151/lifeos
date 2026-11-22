"use client";
import { Download, Paperclip, Trash2 } from "lucide-react";
import * as React from "react";
import { Button, useToast } from "@/components/ui";
import { useGet, useMut } from "@/hooks/use-api";
import { api, del, download } from "@/lib/api";

type FileMeta = { id: string; filename: string; size: number; content_type: string; url: string };

/** Private attachments for any entity (goal, task, note, course, ...). */
export function FileList({ entityType, entityId }: { entityType: string; entityId: string }) {
  const key = ["files", entityType, entityId];
  const q = useGet<FileMeta[]>(key, `/files?entity_type=${entityType}&entity_id=${entityId}`);
  const toast = useToast();
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const remove = useMut((id: string) => del(`/files/${id}`), { invalidate: [key], success: "Файл удалён" });
  const upload = async (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("entity_type", entityType);
    fd.append("entity_id", entityId);
    setBusy(true);
    try {
      await api("/files", { method: "POST", form: fd });
      toast("Файл загружен");
      q.refetch();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">Файлы</span>
        <Button size="sm" variant="outline" loading={busy} onClick={() => input.current?.click()}><Paperclip />Прикрепить</Button>
        <input ref={input} type="file" hidden accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.docx,.xlsx,.pptx"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {q.data?.length === 0 && <p className="text-sm text-muted">Нет файлов. PDF, изображения и документы до 15 МБ.</p>}
      <ul className="space-y-1">
        {q.data?.map((f) => (
          <li key={f.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate">{f.filename}</span>
            <span className="text-xs text-muted">{(f.size / 1024).toFixed(0)} КБ</span>
            <Button size="icon-sm" variant="ghost" aria-label="Скачать" onClick={() => download(`/files/${f.id}/download`, f.filename)}><Download /></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Удалить" onClick={() => remove.mutate(f.id)}><Trash2 /></Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
