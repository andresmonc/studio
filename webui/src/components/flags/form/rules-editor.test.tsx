import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  RulesEditor,
  EMPTY_QUERY,
  newOutcome,
  nextId,
  type Rule,
  type Tr,
} from "./flag-form";

// t returns the i18n key verbatim, so we can assert on raw keys (matches
// the convention used in flags.test.tsx for the editor components).
const t = ((key: string) => key) as unknown as Tr;

const makeRule = (name: string): Rule => ({
  id: nextId(),
  name,
  query: { ...EMPTY_QUERY },
  outcome: newOutcome("on"),
});

describe("RulesEditor keyword chips", () => {
  it("labels the first rule IF, subsequent rules ELSE IF, and the default OTHERWISE/Fallback", () => {
    const { getByText, getAllByText } = render(
      <RulesEditor
        t={t}
        variationNames={["on", "off"]}
        rules={[makeRule("Rule 1"), makeRule("Rule 2")]}
        setRules={() => {}}
        defaultOutcome={newOutcome("off")}
        setDefaultOutcome={() => {}}
      />,
    );

    // First rule -> IF, second rule -> ELSE IF (only one of each).
    expect(getByText("flag.wizard.if")).toBeTruthy();
    expect(getByText("flag.wizard.elseIf")).toBeTruthy();

    // Each rule has a THEN chip; with two rules there are two.
    expect(getAllByText("flag.wizard.then")).toHaveLength(2);

    // Default section -> OTHERWISE keyword + Fallback badge.
    expect(getByText("flag.wizard.otherwise")).toBeTruthy();
    expect(getByText("flag.wizard.fallbackBadge")).toBeTruthy();
  });
});
