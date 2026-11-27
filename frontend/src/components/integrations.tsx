"use client";
import { Apple, CalendarDays, FileUp, RefreshCw } from "lucide-react";
import * as React from "react";
import { Badge, Button, Card, CardBody, CardHeader, Dialog, Field, Input, Select, useToast } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { api, del, get, post } from "@/lib/api";
import { fmtDateTime } from "@/lib/utils";

type Acc = { connected: boolean; email: string | null; last_sync_at: string | null; last_error: string | null };
type Integrations = {
  google: Acc & { configured: boolean; calendars: string[]; write_calendar: string | null };
  caldav: Acc & { server_url: string | null; calendar_name: string | null };
  sync_minutes: number;
};
type SyncStats = Record<"pulled_created" | "pulled_updated" | "pulled_deleted" | "pushed_created" | "pushed_updated" | "pushed_deleted", number>;
type Cal = { url: string; name: string; color: string | null };

const ICLOUD = "https://caldav.icloud.com/";
const KEY = ["integrations"];

export function syncSummary(s: SyncStats): string {
  const pulled = s.pulled_created + s.pulled_updated + s.pulled_deleted;
  const pushed = s.pushed_created + s.pushed_updated + s.pushed_deleted;
  if (!pulled && !pushed) return "Синхронизировано, изменений нет";
  return `Синхронизировано: получено ${pulled}, отправлено ${pushed}`;
}

function Status({ acc, locale }: { acc?: Acc; locale: string }) {
  if (!acc) return null;
  return (
    <>
      {acc.connected ? <Badge tone="success">подключён</Badge> : <Badge>не подключён</Badge>}
      {acc.connected && acc.email && <span className="ml-2 text-xs text-muted">{acc.email}</span>}
      {acc.last_sync_at && <span className="ml-2 text-xs text-muted">синхр.: {fmtDateTime(acc.last_sync_at, locale)}</span>}
      {acc.connected && acc.last_error && <p className="mt-1 text-xs text-danger">Ошибка синхронизации: {acc.last_error}</p>}
    </>
  );
}

export function CalendarIntegrations() {
  const toast = useToast();
  const { locale } = useI18n();
  const q = useGet<Integrations>(KEY, "/integrations");
  const d = q.data;
  const opts = (msg?: string) => ({ invalidate: [KEY, ["calendar"]], success: msg, onSuccess: (r: unknown) => r && typeof r === "object" && "pulled_created" in r && toast(syncSummary(r as SyncStats)) });
  const syncGoogle = useMut(() => post<SyncStats>("/integrations/google/sync"), opts());
  const offGoogle = useMut(() => del("/integrations/google"), { invalidate: [KEY], success: "Google отключён" });
  const syncDav = useMut(() => post<SyncStats>("/integrations/caldav/sync"), opts());
  const offDav = useMut(() => del("/integrations/caldav"), { invalidate: [KEY], success: "Календарь Apple отключён" });

  React.useEffect(() => {
    const p = new URLSearchParams(location.search).get("google");
    if (!p) return;
    toast(p === "connected" ? "Google Calendar подключён" : p === "scope" ? "Нужно разрешить доступ к календарю — подключите снова и отметьте галочку" : "Подключение Google отменено", p === "connected" ? "success" : "error");
    history.replaceState(null, "", location.pathname + location.hash);
  }, [toast]);

  const connectGoogle = async () => {
    try { const r = await get<{ url: string }>("/integrations/google/connect"); location.href = r.url; } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <Card id="integrations"><CardHeader title={<>Календари{d && <span className="text-xs font-normal text-muted">· двусторонняя синхронизация, авто каждые {d.sync_minutes} мин</span>}</>} /><CardBody className="space-y-5">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <CalendarDays className="size-4 text-muted" />
          <div className="flex-1"><span className="font-medium">Google Calendar</span> <Status acc={d?.google} locale={locale} /></div>
          {d?.google.connected ? <>
            <GoogleCalendarsPicker count={d.google.calendars.length} />
            <Button size="sm" variant="outline" onClick={() => syncGoogle.mutate()} loading={syncGoogle.isPending}><RefreshCw />Синхронизировать</Button>
            <Button size="sm" variant="ghost" onClick={() => offGoogle.mutate()}>Отключить</Button>
          </> : <Button size="sm" onClick={connectGoogle} disabled={!d?.google.configured}>Подключить</Button>}
        </div>
        {d && !d.google.configured && <p className="text-xs text-muted">Чтобы включить Google, администратор сервера задаёт GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET (инструкция в docs/INTEGRATIONS.md).</p>}
      </section>

      <section className="space-y-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Apple className="size-4 text-muted" />
          <div className="flex-1"><span className="font-medium">Apple iCloud Календарь</span>{d?.caldav.calendar_name && d.caldav.connected && <span className="ml-1 text-muted">«{d.caldav.calendar_name}»</span>} <Status acc={d?.caldav} locale={locale} /></div>
          {d?.caldav.connected && <>
            <Button size="sm" variant="outline" onClick={() => syncDav.mutate()} loading={syncDav.isPending}><RefreshCw />Синхронизировать</Button>
            <Button size="sm" variant="ghost" onClick={() => offDav.mutate()}>Отключить</Button>
          </>}
        </div>
        {d && !d.caldav.connected && <CalDAVForm onDone={(r) => { q.refetch(); toast(syncSummary(r)); }} />}
      </section>
      {d?.google.connected && d?.caldav.connected && <p className="text-xs text-muted">Новые события из LIFE OS отправляются в Google Calendar; события Google и iCloud синхронизируются каждый со своим календарём.</p>}
    </CardBody></Card>
  );
}

type GCal = { id: string; name: string; color: string | null; primary: boolean; writable: boolean };

/** Which Google calendars to sync and where new LIFE OS events are created. */
function GoogleCalendarsPicker({ count }: { count: number }) {
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const q = useGet<{ calendars: GCal[]; selected: string[]; write_calendar: string }>(["integrations", "google-calendars"], open ? "/integrations/google/calendars" : null);
  const [sel, setSel] = React.useState<string[]>([]);
  const [write, setWrite] = React.useState("primary");
  React.useEffect(() => { if (q.data) { setSel(q.data.selected); setWrite(q.data.write_calendar); } }, [q.data]);
  const save = useMut(() => api<SyncStats & { removed: string[] }>("/integrations/google/calendars", { method: "PUT", body: { selected: sel, write_calendar: write } }),
    { invalidate: [KEY, ["calendar"]], onSuccess: (r) => { toast(syncSummary(r)); setOpen(false); } });
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Календари ({count})</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Календари Google" description="Отметьте, какие календари показывать в LIFE OS, и куда создавать новые события."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!sel.length}>Сохранить</Button></>}>
        {q.isLoading && <p className="text-sm text-muted">Загружаем список календарей из Google…</p>}
        {q.error && <p className="text-sm text-danger">{q.error.message}</p>}
        {q.data && (
          <div className="space-y-4">
            <ul className="space-y-1">{q.data.calendars.map((c) => (
              <li key={c.id}><label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={sel.includes(c.id)}
                  onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} />
                <span className="size-3 rounded-full" style={{ background: c.color ?? "var(--accent)" }} />
                <span className="flex-1 text-sm">{c.name}{c.primary && <span className="ml-1.5 text-xs text-muted">(основной)</span>}</span>
                {!c.writable && <Badge>только чтение</Badge>}
              </label></li>))}</ul>
            <Field label="Новые события из LIFE OS создавать в">
              <Select value={write} onChange={(e) => setWrite(e.target.value)}>
                {q.data.calendars.filter((c) => c.writable && sel.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <p className="text-xs text-muted">Если снять календарь, его события исчезнут только из LIFE OS — в Google они останутся. Календари «только чтение» (например, праздники) LIFE OS не изменяет.</p>
          </div>
        )}
      </Dialog>
    </>
  );
}

function CalDAVForm({ onDone }: { onDone: (r: SyncStats) => void }) {
  const toast = useToast();
  const [other, setOther] = React.useState(false);
  const [f, setF] = React.useState({ server_url: ICLOUD, username: "", password: "" });
  const [cals, setCals] = React.useState<Cal[] | null>(null);
  const [cal, setCal] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setCals(null); };

  const discover = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await post<{ calendars: Cal[] }>("/integrations/caldav/discover", f);
      setCals(r.calendars);
      setCal(r.calendars[0]?.url ?? "");
    } catch (err) { toast((err as Error).message, "error"); } finally { setBusy(false); }
  };
  const connect = async () => {
    const c = cals?.find((x) => x.url === cal);
    if (!c) return;
    setBusy(true);
    try { onDone(await post<SyncStats>("/integrations/caldav", { ...f, calendar_url: c.url, calendar_name: c.name })); }
    catch (err) { toast((err as Error).message, "error"); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={discover} className="space-y-3 rounded-lg border border-border p-3">
      {!other ? (
        <p className="text-xs text-muted">Нужен <b>пароль приложения</b>, а не пароль Apple ID: откройте{" "}
          <a className="text-accent underline" href="https://account.apple.com/account/manage" target="_blank" rel="noreferrer">account.apple.com</a>{" "}
          → «Вход и безопасность» → «Пароли приложений» → создайте пароль для LIFE OS. Его можно отозвать в любой момент.</p>
      ) : <Field label="Адрес CalDAV-сервера"><Input type="url" required value={f.server_url} onChange={set("server_url")} placeholder="https://caldav.example.com/" /></Field>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={other ? "Логин" : "Apple ID (email)"}><Input required autoComplete="username" value={f.username} onChange={set("username")} /></Field>
        <Field label="Пароль приложения"><Input required type="password" autoComplete="off" value={f.password} onChange={set("password")} placeholder="xxxx-xxxx-xxxx-xxxx" /></Field>
      </div>
      {cals && (
        <Field label="Календарь для синхронизации"><Select value={cal} onChange={(e) => setCal(e.target.value)}>{cals.map((c) => <option key={c.url} value={c.url}>{c.name}</option>)}</Select></Field>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!cals ? <Button type="submit" size="sm" loading={busy}>Найти календари</Button>
          : <Button type="button" size="sm" loading={busy} onClick={connect}>Подключить и синхронизировать</Button>}
        <button type="button" className="text-xs text-muted underline" onClick={() => { setOther(!other); setF({ ...f, server_url: other ? ICLOUD : "" }); setCals(null); }}>
          {other ? "Это iCloud" : "Другой CalDAV-сервер (Fastmail, Nextcloud, Яндекс…)"}</button>
      </div>
    </form>
  );
}

export function NotesImport() {
  const toast = useToast();
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const run = async () => {
    if (!files.length) return;
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    setBusy(true);
    try {
      const r = await api<{ imported: number; duplicates: number; unsupported_files: number }>("/notes/import", { form });
      toast(`Импортировано заметок: ${r.imported}` + (r.duplicates ? `, уже были: ${r.duplicates}` : "") + (r.unsupported_files ? `, пропущено файлов: ${r.unsupported_files}` : ""));
      setFiles([]);
      if (input.current) input.current.value = "";
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  return (
    <Card id="import-notes"><CardHeader title={<>Импорт заметок<span className="text-xs font-normal text-muted">· Google Keep и Apple Notes</span></>} /><CardBody className="space-y-3 text-sm">
      <ul className="list-disc space-y-1.5 pl-5 text-xs text-muted">
        <li><b>Google Keep:</b> откройте <a className="text-accent underline" href="https://takeout.google.com/settings/takeout/custom/keep" target="_blank" rel="noreferrer">Google Takeout</a>, оставьте только «Keep», скачайте архив .zip и загрузите его сюда целиком. У Google нет API Keep для личных аккаунтов, поэтому только так.</li>
        <li><b>Apple Notes:</b> на Mac запустите <code>scripts/export-apple-notes.sh</code> из проекта — он соберёт все заметки в один .zip. Или в Заметках: Файл → Экспортировать как → Markdown (по одной заметке).</li>
        <li>Подходят .zip, .json, .md, .txt, .html. Повторный импорт не создаёт дубликатов. Заметки попадут в папки «Google Keep» и «Apple Notes».</li>
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" multiple accept=".zip,.json,.md,.markdown,.txt,.html,.htm" aria-label="Файлы заметок"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm" />
        <Button size="sm" onClick={run} loading={busy} disabled={!files.length}><FileUp />Импортировать</Button>
      </div>
    </CardBody></Card>
  );
}
