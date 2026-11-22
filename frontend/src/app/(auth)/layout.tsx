import { Suspense } from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-accent text-lg font-bold text-accent-fg">L</div>
          <h1 className="text-lg font-semibold tracking-wide">LIFE OS</h1>
          <p className="mt-1 text-xs text-muted">Build yourself. Master your time. Design your future.</p>
        </div>
        <Suspense>{children}</Suspense>
      </div>
    </div>
  );
}
