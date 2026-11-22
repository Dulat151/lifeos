import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, qs } from "@/lib/api";

afterEach(() => { vi.restoreAllMocks(); document.cookie = "lifeos_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT"; });

describe("api client", () => {
  it("sends the CSRF header on unsafe requests only", async () => {
    document.cookie = "lifeos_csrf=tok123";
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
    await api("/tasks", { method: "POST", body: { title: "x" } });
    expect((f.mock.calls[0][1]!.headers as Record<string, string>)["X-CSRF-Token"]).toBe("tok123");
    await api("/tasks");
    expect((f.mock.calls[1][1]!.headers as Record<string, string>)["X-CSRF-Token"]).toBeUndefined();
  });

  it("normalises validation errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "Ошибка валидации", errors: [{ field: "title", message: "too short" }] }), { status: 422 }));
    await expect(api("/goals", { method: "POST", body: {} })).rejects.toMatchObject({ status: 422, message: expect.stringContaining("title") });
  });

  it("reports network failure as status 0", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    const e = (await api("/x").catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(0);
  });

  it("builds query strings without empty values", () => {
    expect(qs({ a: 1, b: "", c: undefined, d: "x y" })).toBe("?a=1&d=x+y");
  });
});
