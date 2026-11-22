import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  RulesEditor,
  EMPTY_QUERY,
  buildFlagPayload,
  hydrateForm,
  newOutcome,
  nextId,
  type Rule,
  type Tr,
} from "./flag-form";

// t returns the i18n key verbatim, so we can assert on raw keys (matches
// the convention used in flags.test.tsx for the editor components).
const t = ((key: string, p?: { name?: string }) =>
  p?.name ? `${key}:${p.name}` : key) as unknown as Tr;

const makeRule = (name: string, p: Partial<Rule> = {}): Rule => ({
  id: nextId(),
  name,
  query: { ...EMPTY_QUERY },
  outcome: newOutcome("on"),
  ...p,
});

function Harness({
  initial,
  disabled,
  onRules,
}: {
  initial: Rule[];
  disabled?: boolean;
  onRules?: (rules: Rule[]) => void;
}) {
  const [rules, setRules] = useState(initial);
  onRules?.(rules);
  return (
    <RulesEditor
      t={t}
      variationNames={["on", "off"]}
      rules={rules}
      setRules={setRules}
      defaultOutcome={newOutcome("off")}
      setDefaultOutcome={() => {}}
      disabled={disabled}
    />
  );
}

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

describe("RulesEditor rule switch", () => {
  const sw = (name: string) => screen.getByRole("switch", { name: `flag.wizard.ruleSwitch:${name}` });

  it("turns a rule off and back on", () => {
    render(<Harness initial={[makeRule("beta"), makeRule("eu")]} />);
    expect(sw("beta")).toBeChecked();
    fireEvent.click(sw("beta"));
    expect(sw("beta")).not.toBeChecked();
    expect(sw("eu")).toBeChecked();
    expect(within(sw("beta").closest("label")!).getByText("flag.wizard.ruleOff")).toBeInTheDocument();
    fireEvent.click(sw("beta"));
    expect(sw("beta")).toBeChecked();
  });

  it("shows a rule loaded as off", () => {
    render(<Harness initial={[makeRule("beta", { disable: true })]} />);
    expect(sw("beta")).not.toBeChecked();
  });

  it("can still be toggled when the flag is turned off", () => {
    render(<Harness initial={[makeRule("beta")]} disabled />);
    expect(sw("beta")).toBeEnabled();
    fireEvent.click(sw("beta"));
    expect(sw("beta")).not.toBeChecked();
  });

  it("labels a rule without a name by its position", () => {
    render(<Harness initial={[makeRule("beta"), makeRule("")]} />);
    expect(sw("2")).toBeChecked();
  });

  for (const disable of [undefined, false]) {
    it(`gives back the saved payload after turning a rule off and on (disable: ${disable})`, () => {
      const form = hydrateForm({
        variations: { on: true, off: false },
        defaultRule: { variation: "off" },
        targeting: [{ name: "beta", query: "{}", variation: "on", disable }],
      });
      const saved = buildFlagPayload(form);
      let rules = form.rules;
      render(<Harness initial={form.rules} onRules={(r) => (rules = r)} />);

      fireEvent.click(sw("beta"));
      expect(buildFlagPayload({ ...form, rules }).targeting).toEqual([
        expect.objectContaining({ disable: true }),
      ]);
      fireEvent.click(sw("beta"));
      expect(buildFlagPayload({ ...form, rules })).toEqual(saved);
    });
  }
});
