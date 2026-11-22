import { describe, expect, it } from "vitest";
import { isoDate, isoToLocalInput } from "@/lib/utils";
import { translate } from "@/lib/i18n";

describe("utils & i18n", () => {
  it("formats local dates", () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(isoToLocalInput(new Date(2026, 0, 5, 9, 7).toISOString())).toBe("2026-01-05T09:07");
  });
  it("translates with ru fallback", () => {
    expect(translate("en", "nav.tasks")).toBe("Tasks");
    expect(translate("kk", "nav.tasks")).toBe("Тапсырмалар");
    expect(translate("ru", "nav.tasks")).toBe("Задачи");
  });
});
