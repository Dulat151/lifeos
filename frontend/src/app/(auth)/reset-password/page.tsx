"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { ApiError, post } from "@/lib/api";

export default function ResetPage() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = React.useState("");
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Минимум 8 символов");
    setBusy(true);
    setError("");
    try {
      await post("/auth/password-reset/confirm", { token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };
  if (!token) return <Card className="p-6 text-sm">Ссылка некорректна. <Link className="text-accent" href="/forgot-password">Запросить новую</Link></Card>;
  return (
    <Card className="p-6">
      <h2 className="mb-4 text-base font-semibold">Новый пароль</h2>
      {done ? <p className="text-sm">Пароль изменён, все сессии завершены. <Link href="/login" className="text-accent">Войти</Link></p> : (
        <form onSubmit={submit} className="space-y-3">
          <Field label="Новый пароль" error={error}><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Button className="w-full" loading={busy}>Сохранить</Button>
        </form>
      )}
    </Card>
  );
}
