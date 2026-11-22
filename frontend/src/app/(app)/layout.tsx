import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={<div className="text-sm text-muted">Загрузка…</div>}>{children}</Suspense>
    </AppShell>
  );
}
