import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntityForm, type FieldDef } from "@/components/entity";
import { ToastProvider } from "@/components/ui";

const fields: FieldDef[] = [
  { name: "title", label: "Название", required: true },
  { name: "amount", label: "Сумма", type: "number", required: true, min: 1 },
  { name: "tags", label: "Теги", type: "tags" },
  { name: "deadline", label: "Срок", type: "date", nullable: true },
];

describe("EntityForm", () => {
  it("blocks invalid submit and shows field errors", async () => {
    const onSubmit = vi.fn();
    render(<ToastProvider><EntityForm fields={fields} onSubmit={onSubmit} /></ToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Обязательное поле")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("converts values to API payload", async () => {
    const onSubmit = vi.fn();
    render(<ToastProvider><EntityForm fields={fields} onSubmit={onSubmit} /></ToastProvider>);
    fireEvent.change(screen.getByLabelText("Название *"), { target: { value: "Книга" } });
    fireEvent.change(screen.getByLabelText("Сумма *"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Теги"), { target: { value: "a, b ,," } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ title: "Книга", amount: 5, tags: ["a", "b"], deadline: null }));
  });
});
