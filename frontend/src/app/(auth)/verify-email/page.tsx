"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { Card } from "@/components/ui";
import { ApiError, post } from "@/lib/api";

export default function VerifyPage() {
  const token = useSearchParams().get("token") || "";
  const [state, setState] = React.useState<"pending" | "ok" | "error">("pending");
  const [msg, setMsg] = React.useState("");
  const ran = React.useRef(false);
  React.useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) { setState("error"); setMsg("Нет токена"); return; }
    post("/auth/verify-email", { token }).then(() => setState("ok")).catch((e) => { setState("error"); setMsg(e instanceof ApiError ? e.message : "Ошибка"); });
  }, [token]);
  return (
    <Card className="p-6 text-sm">
      {state === "pending" && "Проверяем ссылку…"}
      {state === "ok" && <>Email подтверждён. <Link href="/dashboard" className="text-accent">Перейти в LIFE OS</Link></>}
      {state === "error" && <>Не удалось подтвердить email: {msg}. <Link href="/settings" className="text-accent">Отправить заново</Link></>}
    </Card>
  );
}
