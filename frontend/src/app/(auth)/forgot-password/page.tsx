"use client";
import Link from "next/link";
import * as React from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { ApiError, post } from "@/lib/api";

export default function ForgotPage() {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle");
  const [configured, setConfigured] = React.useState(true);
  const [error, setError] = React.useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const r = await post<{ email_configured: boolean }>("/auth/password-reset/request", { email });
      setConfigured(r.email_configured);
      setState("sent");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ошибка");
      setState("idle");
    }
  };
  return (
    <Card className="p-6">
      <h2 className="mb-4 text-base font-semibold">Восстановление пароля</h2>
      {state === "sent" ? (
        <div className="space-y-2 text-sm">
          <p>Если аккаунт с таким email существует, мы отправили ссылку для сброса пароля.</p>
          {!configured && <p className="text-warning">Отправка писем на сервере не настроена (SMTP). Обратитесь к администратору — ссылка записана в лог сервера.</p>}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button className="w-full" loading={state === "sending"}>Отправить ссылку</Button>
        </form>
      )}
      <p className="mt-4 text-center text-sm"><Link href="/login" className="text-accent">Вернуться ко входу</Link></p>
    </Card>
  );
}
