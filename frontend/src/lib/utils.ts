import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(iso: string | null | undefined, locale = "ru-RU", opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  return d.toLocaleDateString(locale, opts);
}

export function fmtDateTime(iso: string | null | undefined, locale = "ru-RU") {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function fmtTime(iso: string, locale = "ru-RU") {
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

export function fmtMoney(v: string | number, currency = "KZT", locale = "ru-RU") {
  const n = typeof v === "string" ? Number(v) : v;
  try {
    return n.toLocaleString(locale, { style: "currency", currency, maximumFractionDigits: 2 });
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} ч ${m} мин` : `${m} мин`;
}

/** Local date as YYYY-MM-DD (not UTC). */
export function isoDate(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** <input type="datetime-local"> value -> ISO string with the browser's offset. */
export function localInputToIso(v: string) {
  return new Date(v).toISOString();
}

export function isoToLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const PRIORITY_LABEL: Record<number, string> = { 1: "Срочно", 2: "Высокий", 3: "Средний", 4: "Низкий" };
export const STATUS_LABEL: Record<string, string> = { backlog: "Бэклог", todo: "К выполнению", in_progress: "В работе", done: "Готово", cancelled: "Отменено" };
/** Main life areas first (shown in pickers), then legacy/extra categories. */
export const GOAL_CATEGORIES: Record<string, string> = {
  health: "Здоровье", education: "Образование", career: "Карьера", finance: "Финансы", personal_development: "Личное развитие",
  relationships: "Отношения", projects: "Проекты",
  fitness: "Фитнес", intelligence: "Интеллект", social: "Социальное", creativity: "Творчество", technology: "Технологии", languages: "Языки", custom: "Другое",
};
export const GOAL_CATEGORY_COLOR: Record<string, string> = {
  health: "#34d399", education: "#38bdf8", career: "#8b7cf6", finance: "#fbbf24", personal_development: "#f472b6",
  relationships: "#fb7185", projects: "#22d3ee", fitness: "#4ade80", languages: "#60a5fa",
};
