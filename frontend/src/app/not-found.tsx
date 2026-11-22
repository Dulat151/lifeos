import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <h1 className="mb-2 text-2xl font-semibold">Страница не найдена</h1>
        <p className="mb-4 text-sm text-muted">Возможно, она была удалена или адрес введён неверно.</p>
        <Link href="/dashboard" className="text-accent">На главную</Link>
      </div>
    </div>
  );
}
