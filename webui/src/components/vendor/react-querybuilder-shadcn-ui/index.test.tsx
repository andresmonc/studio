import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryBuilder } from "react-querybuilder";
import { QueryBuilderShadcnUi } from "./index";

describe("QueryBuilderShadcnUi", () => {
  it("wires the shadcn controls into a real QueryBuilder", async () => {
    const onQueryChange = vi.fn();
    render(
      <QueryBuilderShadcnUi>
        <QueryBuilder
          fields={[{ name: "email", label: "Email" }]}
          defaultQuery={{ combinator: "and", rules: [] }}
          onQueryChange={onQueryChange}
          showNotToggle
        />
      </QueryBuilderShadcnUi>,
    );
    expect(screen.getByRole("switch")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rule" }));
    // Combinator + operator are ShadcnUiValueSelector, the field is ShadcnUiFieldSelector.
    expect(screen.getAllByRole("combobox").map((c) => c.textContent)).toEqual(["AND", "Email", "="]);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "a");
    const last = onQueryChange.mock.calls.at(-1)?.[0];
    expect(last.rules[0]).toMatchObject({ field: "email", value: "a" });
  });
});
