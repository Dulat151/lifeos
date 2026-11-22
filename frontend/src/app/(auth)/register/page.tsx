"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { ApiError, post } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1, "Введите имя").max(120),
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Минимум 8 символов").regex(/[A-Za-zА-Яа-яЁё]/, "Нужна буква").regex(/\d/, "Нужна цифра"),
  language: z.enum(["ru", "kk", "en"]),
});
type F = z.infer<typeof schema>;

export default function RegisterPage() {
  const { t, setLang } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = React.useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(schema), defaultValues: { language: "ru" } });
  const onSubmit = async (v: F) => {
    setError("");
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      await post("/auth/register", { ...v, timezone });
      setLang(v.language);
      qc.clear();
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ошибка регистрации");
    }
  };
  return (
    <Card className="p-6">
      <h2 className="mb-4 text-base font-semibold">{t("auth.register")}</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        <Field label={t("auth.name")} error={errors.name?.message}><Input autoComplete="name" {...register("name")} /></Field>
        <Field label={t("auth.email")} error={errors.email?.message}><Input type="email" autoComplete="email" {...register("email")} /></Field>
        <Field label={t("auth.password")} error={errors.password?.message} hint="Не менее 8 символов, буквы и цифры">
          <Input type="password" autoComplete="new-password" {...register("password")} />
        </Field>
        <Field label="Язык интерфейса">
          <Select {...register("language")}><option value="ru">Русский</option><option value="kk">Қазақша</option><option value="en">English</option></Select>
        </Field>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" className="w-full" loading={isSubmitting}>{t("auth.register")}</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">{t("auth.have_account")} <Link href="/login" className="text-accent">{t("auth.login")}</Link></p>
    </Card>
  );
}
