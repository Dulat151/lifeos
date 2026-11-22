"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge, Card, EmptyState, PageHeader, QueryState } from "@/components/ui";
import { useGet } from "@/hooks/use-api";

type G = { nodes: { id: string; label: string; type: string }[]; edges: { source: string; target: string; type: string }[] };
const TYPE_COLOR: Record<string, string> = { note: "var(--chart-1)", goal: "var(--chart-2)", course: "var(--chart-3)", book: "var(--chart-4)", task: "var(--chart-5)" };
const TYPE_LABEL: Record<string, string> = { note: "Заметка", goal: "Цель", course: "Курс", book: "Книга", task: "Задача" };

/** Small deterministic force-directed layout (no external graph lib). */
function layout(g: G, w: number, h: number) {
  const pos = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  g.nodes.forEach((n, i) => { const a = (i / Math.max(1, g.nodes.length)) * Math.PI * 2; pos.set(n.id, { x: w / 2 + Math.cos(a) * w / 3, y: h / 2 + Math.sin(a) * h / 3, vx: 0, vy: 0 }); });
  for (let it = 0; it < 300; it++) {
    for (const a of g.nodes) for (const b of g.nodes) {
      if (a.id >= b.id) continue;
      const pa = pos.get(a.id)!, pb = pos.get(b.id)!;
      const dx = pa.x - pb.x, dy = pa.y - pb.y; const d2 = Math.max(dx * dx + dy * dy, 25); const f = 2500 / d2;
      const d = Math.sqrt(d2); pa.vx += (dx / d) * f; pa.vy += (dy / d) * f; pb.vx -= (dx / d) * f; pb.vy -= (dy / d) * f;
    }
    for (const e of g.edges) {
      const pa = pos.get(e.source), pb = pos.get(e.target); if (!pa || !pb) continue;
      const dx = pb.x - pa.x, dy = pb.y - pa.y; const d = Math.sqrt(dx * dx + dy * dy) || 1; const f = (d - 90) * 0.02;
      pa.vx += (dx / d) * f; pa.vy += (dy / d) * f; pb.vx -= (dx / d) * f; pb.vy -= (dy / d) * f;
    }
    for (const p of pos.values()) {
      p.vx += (w / 2 - p.x) * 0.002; p.vy += (h / 2 - p.y) * 0.002;
      p.x = Math.min(w - 20, Math.max(20, p.x + p.vx * 0.5)); p.y = Math.min(h - 20, Math.max(20, p.y + p.vy * 0.5)); p.vx *= 0.6; p.vy *= 0.6;
    }
  }
  return pos;
}

export default function GraphPage() {
  const q = useGet<G>(["notes", "graph"], "/notes/graph");
  const router = useRouter();
  const [hover, setHover] = React.useState<string | null>(null);
  const W = 1000, H = 620;
  const pos = React.useMemo(() => (q.data ? layout(q.data, W, H) : new Map()), [q.data]);
  return (
    <div>
      <PageHeader title="Граф знаний" subtitle="Связи заметок между собой и с целями, курсами, книгами и задачами" />
      <div className="mb-3 flex flex-wrap gap-2">{Object.entries(TYPE_LABEL).map(([k, v]) => <Badge key={k}><span className="size-2 rounded-full" style={{ background: TYPE_COLOR[k] }} />{v}</Badge>)}</div>
      <QueryState q={q} isEmpty={(d) => d.nodes.length === 0} empty={<EmptyState title="Граф пуст" text="Создайте заметки и свяжите их через [[Название]] или привяжите к целям и курсам." />}>
        {(g) => (
          <Card className="overflow-hidden">
            <svg viewBox={`0 0 ${W} ${H}`} className="h-[620px] w-full" role="img" aria-label="Граф знаний">
              {g.edges.map((e, i) => { const a = pos.get(e.source), b = pos.get(e.target); if (!a || !b) return null;
                const hl = hover && (e.source === hover || e.target === hover);
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hl ? "var(--accent)" : "var(--border)"} strokeWidth={hl ? 2 : 1} />; })}
              {g.nodes.map((n) => { const p = pos.get(n.id); if (!p) return null;
                return (
                  <g key={n.id} transform={`translate(${p.x},${p.y})`} className="cursor-pointer" onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                    onClick={() => router.push(n.type === "note" ? `/notes/${n.id}` : n.type === "goal" ? `/goals/${n.id}` : n.type === "course" ? `/courses/${n.id}` : n.type === "book" ? "/books" : "/tasks")}>
                    <circle r={n.type === "note" ? 7 : 10} fill={TYPE_COLOR[n.type]} stroke="var(--surface)" strokeWidth={2} />
                    <text y={-12} textAnchor="middle" fontSize={11} fill="var(--text)" opacity={hover && hover !== n.id ? 0.5 : 1}>{n.label.slice(0, 28)}</text>
                  </g>
                ); })}
            </svg>
          </Card>
        )}
      </QueryState>
    </div>
  );
}
