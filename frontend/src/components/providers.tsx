"use client";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { api, ApiError } from "@/lib/api";
import { LOCALES, translate, type Lang, type TKey } from "@/lib/i18n";
import type { Me } from "@/lib/types";
import { ToastProvider } from "@/components/ui";

/* ---------------------------------------------------------------- i18n */
type I18n = { lang: Lang; locale: string; t: (k: TKey) => string; setLang: (l: Lang) => void };
const I18nCtx = React.createContext<I18n>({ lang: "ru", locale: "ru-RU", t: (k) => translate("ru", k), setLang: () => {} });
export const useI18n = () => React.useContext(I18nCtx);

function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>("ru");
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("lifeos_lang") as Lang | null; // UI preference only
      if (saved) setLangState(saved);
    } catch { /* storage unavailable */ }
  }, []);
  const setLang = React.useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("lifeos_lang", l); } catch { /* ignore */ }
    document.documentElement.lang = l;
  }, []);
  const value = React.useMemo(() => ({ lang, locale: LOCALES[lang], t: (k: TKey) => translate(lang, k), setLang }), [lang, setLang]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

/* ---------------------------------------------------------------- theme */
export function applyTheme(theme: string) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try { localStorage.setItem("lifeos_theme", theme); } catch { /* ignore */ }
}

/* ---------------------------------------------------------------- auth */
export function useMe() {
  return useQuery<Me, ApiError>({ queryKey: ["me"], queryFn: () => api<Me>("/users/me"), retry: false, staleTime: 60_000 });
}

/** Accent from a shop theme: sets --accent and a readable foreground colour. null restores the default. */
export function applyAccent(color: string | null | undefined) {
  const root = document.documentElement;
  if (!color) {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-fg");
    return;
  }
  root.style.setProperty("--accent", color);
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  root.style.setProperty("--accent-fg", 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#111318" : "#ffffff");
}

/** Syncs language, theme and cosmetics from the server profile once the user is loaded. */
export function UserSync() {
  const { data } = useMe();
  const { setLang, lang } = useI18n();
  React.useEffect(() => {
    if (!data) return;
    if (data.profile.language !== lang) setLang(data.profile.language);
    applyTheme(data.settings.theme);
    applyAccent(data.settings.cosmetics?.accent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.profile.language, data?.settings.theme, data?.settings.cosmetics?.accent]);
  return null;
}

export function useInvalidateMe() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["me"] });
}

/* ---------------------------------------------------------------- root */
export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: (n, e) => !(e instanceof ApiError && e.status < 500 && e.status > 0) && n < 2 },
    },
  }));
  React.useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    // Offline outbox: replay queued writes when back online, then refresh data from the server (source of truth).
    const flush = () => navigator.serviceWorker.controller?.postMessage("flush-outbox");
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "outbox-replayed") qc.invalidateQueries(); };
    window.addEventListener("online", flush);
    navigator.serviceWorker.addEventListener("message", onMsg);
    flush();
    return () => { window.removeEventListener("online", flush); navigator.serviceWorker.removeEventListener("message", onMsg); };
  }, [qc]);
  return (
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
