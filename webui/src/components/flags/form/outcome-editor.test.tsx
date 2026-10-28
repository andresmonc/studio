import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  OutcomeEditor,
  newOutcome,
  newProg,
  type Outcome,
  type Tr,
} from "./flag-form";

// t returns the i18n key verbatim, so we can assert on raw keys (matches
// the convention used in rules-editor.test.tsx for the editor components).
const t = ((key: string) => key) as unknown as Tr;

const variationNames = ["on", "off"];

// percentageOutcome builds an Outcome in percentage mode, which is the only
// mode that renders the Tips callout.
const percentageOutcome = (): Outcome => ({
  ...newOutcome(),
  mode: "percentage",
});

describe("OutcomeEditor percentage Tips callout", () => {
  it("shows the Tips callout in edit mode (default)", () => {
    const { queryByText } = render(
      <OutcomeEditor
        t={t}
        variationNames={variationNames}
        outcome={percentageOutcome()}
        onChange={() => {}}
      />,
    );

    expect(queryByText("flag.wizard.percentTips")).not.toBeNull();
  });

  it("hides the Tips callout in creation mode", () => {
    const { queryByText } = render(
      <OutcomeEditor
        t={t}
        variationNames={variationNames}
        outcome={percentageOutcome()}
        onChange={() => {}}
        isCreate
      />,
    );

    expect(queryByText("flag.wizard.percentTips")).toBeNull();
  });
});

// progressiveOutcome builds an Outcome in progressive mode, overriding the
// initial/end variation refs (default "" = nothing selected).
const progressiveOutcome = (prog: Partial<Outcome["prog"]> = {}): Outcome => ({
  ...newOutcome(),
  mode: "progressive",
  prog: { ...newProg(), ...prog },
});

describe("OutcomeEditor progressive variation error state", () => {
  it("marks an unselected variation select as aria-invalid", () => {
    const { getAllByRole } = render(
      <OutcomeEditor
        t={t}
        variationNames={variationNames}
        outcome={progressiveOutcome()}
        onChange={() => {}}
      />,
    );

    // Progressive mode renders the initial and end variation triggers as the
    // first two comboboxes, in DOM order: [0] initial, [1] end.
    const [initial, end] = getAllByRole("combobox");
    expect(initial).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAttribute("aria-invalid", "true");
  });

  it("does not mark a selected variation select as aria-invalid", () => {
    const { getAllByRole } = render(
      <OutcomeEditor
        t={t}
        variationNames={variationNames}
        outcome={progressiveOutcome({
          initialVariation: "on",
          endVariation: "off",
        })}
        onChange={() => {}}
      />,
    );

    const [initial, end] = getAllByRole("combobox");
    expect(initial).toHaveAttribute("aria-invalid", "false");
    expect(end).toHaveAttribute("aria-invalid", "false");
  });

  // A stale ref (a variation that was renamed/deleted and is no longer in
  // variationNames) is non-empty but invalid: outcomeValid gates saving on
  // names.includes(...), so the error state must match that predicate, not a
  // bare empty-string check.
  it("marks a stale variation ref as aria-invalid", () => {
    const { getAllByRole } = render(
      <OutcomeEditor
        t={t}
        variationNames={variationNames}
        outcome={progressiveOutcome({
          initialVariation: "deleted",
          endVariation: "off",
        })}
        onChange={() => {}}
      />,
    );

    const [initial, end] = getAllByRole("combobox");
    expect(initial).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAttribute("aria-invalid", "false");
  });
});

describe("OutcomeEditor interactions", () => {
  const renderEditor = (outcome: Outcome) => {
    const onChange = vi.fn();
    render(
      <OutcomeEditor
        t={t}
        variationNames={variationNames}
        outcome={outcome}
        onChange={onChange}
      />,
    );
    return onChange;
  };

  const tests: {
    name: string;
    outcome: () => Outcome;
    act: () => void;
    want: (o: Outcome) => void;
  }[] = [
    {
      name: "mode switch reports the new mode",
      outcome: () => newOutcome(),
      act: () => fireEvent.click(screen.getByText("flag.wizard.percentage")),
      want: (o) => expect(o.mode).toBe("percentage"),
    },
    {
      name: "typing a percentage clamps to the remaining room",
      outcome: () => ({ ...percentageOutcome(), percentages: { off: 70 } }),
      act: () =>
        fireEvent.change(screen.getByLabelText("on percentage"), {
          target: { value: "50" },
        }),
      want: (o) => expect(o.percentages).toEqual({ on: 30, off: 70 }),
    },
    {
      name: "sliding a percentage updates that variation",
      outcome: () => ({ ...percentageOutcome(), percentages: { on: 10, off: 20 } }),
      act: () =>
        fireEvent.keyDown(screen.getAllByRole("slider")[1], { key: "ArrowRight" }),
      want: (o) => expect(o.percentages).toEqual({ on: 10, off: 21 }),
    },
    {
      name: "editing the progressive start date updates prog",
      outcome: () => progressiveOutcome(),
      act: () =>
        fireEvent.change(document.querySelectorAll('input[type="datetime-local"]')[0], {
          target: { value: "2030-01-02T03:04" },
        }),
      want: (o) => expect(o.prog.startDate).toBe("2030-01-02T03:04"),
    },
    {
      name: "editing the progressive end date updates prog",
      outcome: () => progressiveOutcome(),
      act: () =>
        fireEvent.change(document.querySelectorAll('input[type="datetime-local"]')[1], {
          target: { value: "2030-02-03T04:05" },
        }),
      want: (o) => expect(o.prog.endDate).toBe("2030-02-03T04:05"),
    },
    {
      name: "sliding the progressive range updates both bounds",
      outcome: () => progressiveOutcome({ initialPct: 10, endPct: 90 }),
      act: () =>
        fireEvent.keyDown(screen.getAllByRole("slider")[0], { key: "ArrowRight" }),
      want: (o) => expect([o.prog.initialPct, o.prog.endPct]).toEqual([11, 90]),
    },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      const onChange = renderEditor(tt.outcome());
      tt.act();
      expect(onChange).toHaveBeenCalledTimes(1);
      tt.want(onChange.mock.calls[0][0]);
    });
  }

  const sumTests: { name: string; percentages: Record<string, number>; wantError: boolean }[] = [
    { name: "a total of 100 is neutral", percentages: { on: 40, off: 60 }, wantError: false },
    { name: "a total below 100 is flagged", percentages: { on: 40 }, wantError: true },
  ];

  for (const tt of sumTests) {
    it(`percent sum: ${tt.name}`, () => {
      renderEditor({ ...percentageOutcome(), percentages: tt.percentages });
      expect(
        screen.getByText("flag.wizard.percentSum").classList.contains("text-destructive"),
      ).toBe(tt.wantError);
    });
  }
});
