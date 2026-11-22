"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Card, Field, Input } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { ApiError, post } from "@/lib/api";

const schema = z.object({ email: z.string().email("Некорректный email"), password: z.string().min(1, "Введите пароль") });
type F = z.infer<typeof schema>;

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = React.useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(schema) });
  const onSubmit = async (v: F) => {
    setError("");
    try {
      await post("/auth/login", v);
      qc.clear();
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ошибка входа");
    }
  };
  return (
    <Card className="p-6">
      <h2 className="mb-4 text-base font-semibold">{t("auth.login")}</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        <Field label={t("auth.email")} error={errors.email?.message}><Input type="email" autoComplete="email" {...register("email")} /></Field>
        <Field label={t("auth.password")} error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register("password")} /></Field>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" className="w-full" loading={isSubmitting}>{t("auth.login")}</Button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-muted hover:text-text">{t("auth.forgot")}</Link>
        <Link href="/register" className="text-accent">{t("auth.register")}</Link>
      </div>
    </Card>
  );
}
