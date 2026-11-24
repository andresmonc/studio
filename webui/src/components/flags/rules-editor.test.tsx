import { beforeEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RulesEditor,
  EMPTY_QUERY,
  buildFlagPayload,
  hydrateForm,
  newOutcome,
  nextId,
  ruleIssues,
  type Rule,
  type Tr,
} from "./flag-form";

// t returns the i18n key verbatim, so we can assert on raw keys (matches
// the convention used in flags.test.tsx for the editor components).
const t = ((key: string, p?: { name?: string }) =>
  p?.name ? `${key}:${p.name}` : key) as unknown as Tr;

const COND = { combinator: "and", rules: [{ field: "country", operator: "=", value: "FR" }] };

const makeRule = (name: string, p: Partial<Rule> = {}): Rule => ({
  id: nextId(),
  name,
  query: COND,
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
    const { getByText, queryAllByText } = render(
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

    // Rules start collapsed, so no THEN chip is rendered yet.
    expect(queryAllByText("flag.wizard.then")).toHaveLength(0);

    // Default section -> OTHERWISE keyword + Fallback badge.
    expect(getByText("flag.wizard.otherwise")).toBeTruthy();
    expect(getByText("flag.wizard.fallbackBadge")).toBeTruthy();
  });
});

describe("RulesEditor tips", () => {
  beforeEach(() => localStorage.clear());
  const editor = (showTips?: boolean) => (
    <RulesEditor
      t={t}
      variationNames={["on", "off"]}
      rules={[]}
      setRules={() => {}}
      defaultOutcome={newOutcome("off")}
      setDefaultOutcome={() => {}}
      showTips={showTips}
    />
  );
  const tips = () => [
    screen.queryAllByText("flag.detail.targetingTips").length,
    screen.queryAllByText("flag.detail.defaultRuleTips").length,
  ];

  const tests = [
    { name: "shows a tip in each card", showTips: true, want: [1, 1] },
    { name: "hides the tips by default", showTips: undefined, want: [0, 0] },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      render(editor(tt.showTips));
      expect(tips()).toEqual(tt.want);
    });
  }

  it("removes a tip on its own and keeps it hidden after a reload", () => {
    const { unmount } = render(editor(true));
    fireEvent.click(screen.getAllByRole("button", { name: "common.hideTip" })[0]);
    // It fades out first and is removed once the animation ends.
    expect(tips()).toEqual([1, 1]);
    fireEvent.animationEnd(screen.getByText("flag.detail.targetingTips").closest("div")!);
    expect(tips()).toEqual([0, 1]);

    unmount();
    render(editor(true));
    expect(tips()).toEqual([0, 1]);
  });
});

const edit = (name: string) => screen.getByRole("button", { name: `flag.wizard.ruleEdit:${name}` });
const nameInputs = () => screen.queryAllByRole("textbox");

describe("RulesEditor rule switch", () => {
  const sw = (name: string) => screen.getByRole("switch", { name: `flag.wizard.ruleSwitch:${name}` });

  it("turns a rule off and back on", () => {
    render(<Harness initial={[makeRule("beta"), makeRule("eu")]} />);
    expect(sw("beta")).toBeChecked();
    fireEvent.click(sw("beta"));
    expect(sw("beta")).not.toBeChecked();
    expect(sw("eu")).toBeChecked();
    expect(within(sw("beta").closest("label")!).getByText("flag.wizard.ruleOff")).toBeInTheDocument();
    const dimmed = () =>
      ["beta", "eu"].map((n) => edit(n).classList.contains("opacity-50"));
    expect(dimmed()).toEqual([true, false]);
    fireEvent.click(sw("beta"));
    expect(sw("beta")).toBeChecked();
    expect(dimmed()).toEqual([false, false]);
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

describe("RulesEditor compact rows", () => {
  for (const operator of ["between", "notBetween"]) {
    it(`explains incomplete ${operator} bounds in collapsed and expanded rules`, () => {
      let rules: Rule[] = [];
      render(<Harness initial={[makeRule("range", {
        query: { combinator: "and", rules: [{ field: "age", operator, value: "10," }] },
      })]} onRules={(r) => (rules = r)} />);
      expect(edit("range")).toHaveAccessibleDescription(/flag.wizard.ruleIssueRange/);
      fireEvent.click(screen.getByRole("button", { name: /flag.wizard.ruleIssueRange.*flag.wizard.ruleFix/ }));
      const conditions = screen.getByRole("group", { name: "flag.wizard.ruleConditions:range" });
      expect(conditions).toHaveAccessibleDescription("flag.wizard.ruleIssueRange");
      const [lower, upper] = within(conditions).getAllByRole("textbox");
      fireEvent.change(upper, { target: { value: "20" } });
      expect(ruleIssues(rules[0], ["on", "off"])).toEqual([]);
      expect(conditions).not.toHaveAccessibleDescription();
      expect(screen.queryByText("flag.wizard.ruleIssueRange")).toBeNull();
      fireEvent.change(lower, { target: { value: "" } });
      expect(conditions).toHaveAccessibleDescription("flag.wizard.ruleIssueRange");
      expect(ruleIssues(rules[0], ["on", "off"])).toEqual(["range"]);
      fireEvent.click(screen.getAllByRole("button", { name: "flag.wizard.ruleDone" })[0]);
      expect(screen.getByRole("button", { name: /flag.wizard.ruleIssueRange.*flag.wizard.ruleFix/ })).toBeInTheDocument();
    });
  }

  it("distinguishes an untouched condition from an explicitly cleared literal across reopening", () => {
    let rules: Rule[] = [];
    render(<Harness initial={[]} onRules={(r) => (rules = r)} />);
    fireEvent.click(screen.getByRole("button", { name: "flag.wizard.addRule" }));
    expect(ruleIssues(rules[0], ["on", "off"])).toEqual(["value"]);
    const value = screen.getByDisplayValue("");
    fireEvent.change(value, { target: { value: "draft" } });
    fireEvent.change(value, { target: { value: "" } });
    expect(ruleIssues(rules[0], ["on", "off"])).toEqual([]);
    fireEvent.click(screen.getAllByRole("button", { name: "flag.wizard.ruleDone" })[0]);
    fireEvent.click(edit("Rule 1"));
    expect(screen.getByDisplayValue("")).toBeInTheDocument();
    expect(ruleIssues(rules[0], ["on", "off"])).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Rule" }));
    expect(ruleIssues(rules[0], ["on", "off"])).toEqual(["value"]);
  });

  const pct = (on: number, off: number) => ({
    ...newOutcome(),
    mode: "percentage" as const,
    percentages: { on, off },
  });

  const summaries = [
    { name: "single", outcome: newOutcome("on"), want: "country is 'FR'. flag.wizard.then on" },
    { name: "percentage", outcome: pct(30, 70), want: "country is 'FR'. flag.wizard.then on: 30%, off: 70%" },
    {
      name: "percentage missing a variation's weight",
      outcome: { ...pct(100, 0), percentages: { on: 100 } },
      want: "country is 'FR'. flag.wizard.then on: 100%, off: 0%",
    },
    {
      name: "progressive",
      outcome: {
        ...newOutcome(),
        mode: "progressive" as const,
        prog: { ...newOutcome().prog, initialVariation: "off", endVariation: "on" },
      },
      want: "country is 'FR'. flag.wizard.then off → on",
    },
  ];
  for (const tt of summaries) {
    it(`describes the condition and ${tt.name} outcome to assistive technology`, () => {
      render(<Harness initial={[makeRule("beta", { outcome: tt.outcome })]} />);
      expect(edit("beta")).toHaveAccessibleDescription(tt.want);
    });
  }

  const incomplete = [
    {
      name: "an unset value",
      rules: [{ field: "targetingKey", operator: "=", value: undefined }],
      want: "flag.wizard.ruleIssueValue",
    },
    {
      name: "a half-filled range next to a complete condition",
      rules: [...COND.rules, { field: "age", operator: "between", value: "10," }],
      want: "flag.wizard.ruleIssueRange",
    },
    {
      name: "an empty in list",
      rules: [{ field: "plan", operator: "in", value: "" }],
      want: "flag.wizard.ruleIssueValue",
    },
  ];
  for (const tt of incomplete) {
    it(`summarises a collapsed rule with ${tt.name} by what is missing`, () => {
      render(<Harness initial={[makeRule("beta", { query: { combinator: "and", rules: tt.rules } })]} />);
      expect(edit("beta")).toHaveAccessibleDescription(`${tt.want}. flag.wizard.then on`);
      expect(within(edit("beta")).getByTitle(tt.want)).toBeInTheDocument();
    });
  }

  it("starts collapsed with a one-line summary", () => {
    render(
      <Harness
        initial={[
          makeRule("beta", {
            query: { combinator: "and", rules: [{ field: "email", operator: "endsWith", value: "@acme.co" }] },
          }),
          makeRule("empty", { query: { ...EMPTY_QUERY } }),
        ]}
      />,
    );
    expect(nameInputs()).toHaveLength(0);
    expect(within(edit("beta")).getByTitle(/email ends with/)).toBeInTheDocument();
    expect(within(edit("empty")).getByText("flag.wizard.ruleNoCondition")).toBeInTheDocument();
    expect(within(edit("beta")).getByText("on")).toBeInTheDocument();
  });

  it("opens one rule at a time and collapses it again", () => {
    render(<Harness initial={[makeRule("beta"), makeRule("eu")]} />);
    fireEvent.click(edit("beta"));
    expect(screen.getByDisplayValue("beta")).toBeInTheDocument();
    fireEvent.click(edit("eu"));
    expect(screen.getByDisplayValue("eu")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("beta")).toBeNull();
    // Done button and header chevron both collapse the open rule.
    fireEvent.click(screen.getAllByRole("button", { name: "flag.wizard.ruleDone" })[0]);
    expect(nameInputs()).toHaveLength(0);
    fireEvent.click(edit("eu"));
    fireEvent.click(screen.getAllByRole("button", { name: "flag.wizard.ruleDone" })[1]);
    expect(nameInputs()).toHaveLength(0);
  });

  // Header chevron comes first, the Done button at the bottom of the rule second.
  for (const tt of [{ name: "header chevron", idx: 0 }, { name: "Done button", idx: 1 }]) {
    it(`moves keyboard focus into an opened rule and back to its row when closed with the ${tt.name}`, async () => {
      const user = userEvent.setup();
      render(<Harness initial={[makeRule("beta"), makeRule("eu")]} />);
      edit("eu").focus();
      await user.keyboard("{Enter}");
      expect(screen.getByDisplayValue("eu")).toHaveFocus();
      screen.getAllByRole("button", { name: "flag.wizard.ruleDone" })[tt.idx].focus();
      await user.keyboard("{Enter}");
      expect(edit("eu")).toHaveFocus();
    });
  }

  it("opens a newly added rule", () => {
    render(<Harness initial={[makeRule("beta")]} />);
    fireEvent.click(screen.getByRole("button", { name: "flag.wizard.addRule" }));
    // Name input + the pre-filled condition's (still empty) value input.
    expect(nameInputs()).toHaveLength(2);
    expect(screen.getByDisplayValue("Rule 1")).toHaveFocus();
    expect(edit("beta")).toBeInTheDocument();
  });

  it("forgets the open rule when it is removed", () => {
    let rules: Rule[] = [];
    render(<Harness initial={[makeRule("beta")]} onRules={(r) => (rules = r)} />);
    fireEvent.click(edit("beta"));
    fireEvent.click(screen.getByRole("button", { name: "common.remove" }));
    expect(rules).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "flag.wizard.ruleDone" })).toBeNull();
  });

  it("keeps the open rule open when another rule is removed", () => {
    let rules: Rule[] = [];
    render(<Harness initial={[makeRule("beta"), makeRule("eu")]} onRules={(r) => (rules = r)} />);
    fireEvent.click(edit("beta"));
    fireEvent.click(screen.getAllByRole("button", { name: "common.remove" })[1]);
    expect(rules.map((r) => r.name)).toEqual(["beta"]);
    expect(screen.getByDisplayValue("beta")).toBeInTheDocument();
  });

  it("edits an open rule's name and outcome", () => {
    let rules: Rule[] = [];
    render(<Harness initial={[makeRule("beta")]} onRules={(r) => (rules = r)} />);
    fireEvent.click(edit("beta"));
    fireEvent.change(screen.getByDisplayValue("beta"), { target: { value: "gamma" } });
    expect(rules[0].name).toBe("gamma");
    const rule = screen.getByDisplayValue("gamma").closest<HTMLElement>("[data-slot=collapsible]")!;
    fireEvent.click(within(rule).getByText("flag.wizard.percentage"));
    expect(rules[0].outcome.mode).toBe("percentage");
  });

  it("toggles a collapsed rule without opening it", () => {
    render(<Harness initial={[makeRule("beta")]} />);
    fireEvent.click(screen.getByRole("switch", { name: "flag.wizard.ruleSwitch:beta" }));
    expect(nameInputs()).toHaveLength(0);
  });

  const invalidCases: { name: string; rule: Partial<Rule>; want: string | null }[] = [
    { name: "single variation", rule: {}, want: null },
    { name: "percentages adding up to 100", rule: { outcome: pct(30, 70) }, want: null },
    {
      name: "percentages not adding up to 100",
      rule: { outcome: pct(30, 30) },
      want: "flag.wizard.ruleIssueOutcome",
    },
    {
      name: "no condition",
      rule: { query: { ...EMPTY_QUERY } },
      want: "flag.wizard.ruleIssueCondition",
    },
    {
      name: "blank name and no condition",
      rule: { name: "  ", query: { ...EMPTY_QUERY } },
      want: "flag.wizard.ruleIssueName · flag.wizard.ruleIssueCondition",
    },
  ];
  for (const tt of invalidCases) {
    it(`warns about an incomplete collapsed rule: ${tt.name}`, () => {
      render(<Harness initial={[makeRule("beta", tt.rule)]} />);
      const row = screen.getAllByRole("button", { name: /flag.wizard.ruleEdit/ })[0];
      const fix = screen.queryByRole("button", { name: /flag.wizard.ruleFix/ });
      expect(fix?.textContent ?? null).toBe(tt.want && `${tt.want}flag.wizard.ruleFix`);
      expect(row.closest("[data-slot=collapsible]")!.classList.contains("border-destructive")).toBe(
        tt.want !== null,
      );
    });
  }

  it("opens the rule from the warning's Fix action", () => {
    render(<Harness initial={[makeRule("beta", { query: { ...EMPTY_QUERY } })]} />);
    fireEvent.click(screen.getByRole("button", { name: /flag.wizard.ruleFix/ }));
    expect(screen.getByDisplayValue("beta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /flag.wizard.ruleFix/ })).toBeNull();
  });
});
