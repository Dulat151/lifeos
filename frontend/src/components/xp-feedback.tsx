"use client";
import { Coins, Sparkles, Trophy } from "lucide-react";
import * as React from "react";
import { useMe } from "@/components/providers";
import { Button, Dialog } from "@/components/ui";
import { useGet } from "@/hooks/use-api";
import type { GamSummary } from "@/lib/types";

/**
 * Watches the XP summary (refetched after every mutation, see useMut) and celebrates real gains:
 * a floating "+N XP · +M coins" pill and a level-up dialog. Nothing is shown for the initial load,
 * for losses (undo) or when the user turned animations / gamification off.
 */
export function XpFeedback() {
  const me = useMe();
  const enabled = me.data?.settings.gamification_enabled !== false && me.data?.settings.preferences?.xp_animations !== false;
  const q = useGet<GamSummary>(["gamification", "summary"], me.data ? "/gamification/summary" : null);
  const prev = React.useRef<GamSummary | null>(null);
  const [pops, setPops] = React.useState<{ id: number; xp: number; coins: number }[]>([]);
  const [levelUp, setLevelUp] = React.useState<number | null>(null);

  React.useEffect(() => {
    const cur = q.data;
    if (!cur) return;
    const p = prev.current;
    prev.current = cur;
    if (!p || !enabled) return;
    const dxp = cur.xp - p.xp;
    const dcoins = cur.coins - p.coins;
    if (dxp > 0) {
      const id = Date.now();
      setPops((x) => [...x.slice(-2), { id, xp: dxp, coins: Math.max(0, dcoins) }]);
      setTimeout(() => setPops((x) => x.filter((i) => i.id !== id)), 1700);
    }
    if (cur.level > p.level) setLevelUp(cur.level);
  }, [q.data, enabled]);

  return (
    <>
      <div className="pointer-events-none fixed right-4 top-16 z-[70] flex flex-col items-end gap-2 lg:right-8" aria-live="polite">
        {pops.map((p) => (
          <div key={p.id} className="flex animate-float-up items-center gap-2 rounded-full border border-accent/30 bg-surface px-3.5 py-1.5 text-sm font-semibold shadow-[var(--glow)]">
            <Sparkles className="size-4 text-accent" />+{p.xp} XP
            {p.coins > 0 && <span className="flex items-center gap-1 text-warning"><Coins className="size-3.5" />+{p.coins}</span>}
          </div>
        ))}
      </div>
      {levelUp && (
        <Dialog open onOpenChange={(o) => !o && setLevelUp(null)} title="Новый уровень!" description="Вы растёте — так держать.">
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="relative grid size-28 place-items-center">
              <span className="absolute inset-0 rounded-full bg-accent/30" style={{ animation: "burst 1.2s ease-out infinite" }} />
              <span className="absolute inset-2 rounded-full bg-accent/20" style={{ animation: "burst 1.2s 0.3s ease-out infinite" }} />
              <div className="relative grid size-24 place-items-center rounded-full bg-accent text-accent-fg shadow-[var(--glow)]">
                <div><Trophy className="mx-auto size-6" /><div className="text-3xl font-bold leading-none">{levelUp}</div></div>
              </div>
            </div>
            <p className="max-w-xs text-sm text-muted">Уровень {levelUp} открыт. Загляните в магазин наград — монеты можно потратить на темы и значки.</p>
            <div className="flex gap-2">
              <Button variant="outline" asChild><a href="/rewards?tab=shop">В магазин</a></Button>
              <Button onClick={() => setLevelUp(null)}>Продолжить</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
