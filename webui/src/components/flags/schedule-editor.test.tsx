import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  EMPTY_QUERY,
  ScheduleEditor,
  newOutcome,
  newScheduleStep,
  nextId,
  sortedSteps,
  type Outcome,
  type Rule,
  type ScheduleStep,
  type Tr,
} from "./flag-form";

const t = ((key: string, p?: { target?: string; timeZone?: string; name?: string }) =>
  p?.target || p?.timeZone || p?.name ? `${key}:${p.target ?? p.timeZone ?? p.name}` : key) as unknown as Tr;

const rule = (name: string, outcome: Outcome): Rule => ({
  id: nextId(),
  name,
  query: { ...EMPTY_QUERY },
  outcome,
});
const beta = rule("beta", newOutcome("on"));
const ramp = rule("ramp", { ...newOutcome(), mode: "progressive" });

let latest: ScheduleStep[] = [];

function Harness({ initial = [] as ScheduleStep[], rules = [beta, ramp], names = ["on", "off"] }) {
  const [schedule, setSchedule] = useState(initial);
  latest = schedule;
  return (
    <ScheduleEditor
      t={t}
      variationNames={names}
      rules={rules}
      defaultOutcome={newOutcome("off")}
      schedule={schedule}
      setSchedule={setSchedule}
      flagOff={false}
    />
  );
}

const split = (on: number, off: number): Outcome => ({
  ...newOutcome(),
  mode: "percentage",
  percentages: { on, off },
});
const step = (date: string, p: Partial<ScheduleStep> = {}): ScheduleStep => ({
  ...newScheduleStep(date),
  ...p,
});
const edit = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name: `flag.detail.schedule.editServe:${name}` }));

describe("ScheduleEditor", () => {
  it("starts with Add step as the main action and adds a step dated tomorrow at midnight", () => {
    render(<Harness />);
    expect(screen.getByText("flag.detail.schedule.empty")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /flag.detail.schedule.addStep/ }));
    expect(latest).toHaveLength(1);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(new Date(latest[0].date).getDate()).toBe(tomorrow.getDate());
    expect(latest[0].date.endsWith("T00:00")).toBe(true);
    expect(screen.getByText("flag.detail.schedule.stepEmpty")).toBeInTheDocument();
  });

  it("dates a new step the day after the last one", () => {
    render(<Harness initial={[step("2999-01-05T10:30")]} />);
    fireEvent.click(screen.getByRole("button", { name: /flag.detail.schedule.addStep/ }));
    expect(sortedSteps(latest).at(-1)!.date).toBe("2999-01-06T00:00");
  });

  it("dates a new step tomorrow when the last one has no date", () => {
    render(<Harness initial={[step("")]} />);
    fireEvent.click(screen.getByRole("button", { name: /flag.detail.schedule.addStep/ }));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(new Date(sortedSteps(latest).at(-1)!.date).getDate()).toBe(tomorrow.getDate());
  });

  it("lists steps in date order with their status and marks now", () => {
    render(
      <Harness
        initial={[
          step("2999-01-02T00:00", { flagState: "enable" }),
          step("2000-01-01T00:00", { flagState: "disable" }),
          step("2999-01-01T00:00", { flagState: "enable" }),
        ]}
      />,
    );
    const steps = screen.getAllByRole("listitem");
    const now = screen.getByText("flag.detail.schedule.now");
    expect(steps[0].compareDocumentPosition(now)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(steps[1].compareDocumentPosition(now)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
    expect(steps.map((li) => (within(li).getByLabelText("flag.wizard.date") as HTMLInputElement).value)).toEqual([
      "2000-01-01T00:00",
      "2999-01-01T00:00",
      "2999-01-02T00:00",
    ]);
    expect(within(steps[1]).getByText("flag.detail.schedule.status.next")).toBeInTheDocument();
    expect(screen.getAllByText(/flag.detail.schedule.status/)).toHaveLength(1);
  });

  it("collapses applied steps to what they change", () => {
    render(<Harness initial={[step("2000-01-01T00:00", { defaultOutcome: newOutcome("on") })]} />);
    const toggle = screen.getByRole("button", { name: "flag.detail.schedule.toggleStep" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("flag.wizard.defaultRule")).toBeInTheDocument();
    expect(screen.queryByText("beta")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("re-sorts only once the date edit is done", () => {
    render(
      <Harness
        initial={[step("2999-01-01T00:00", { flagState: "enable" }), step("2999-01-02T00:00", { flagState: "disable" })]}
      />,
    );
    const first = screen.getAllByLabelText("flag.wizard.date")[0] as HTMLInputElement;
    fireEvent.change(first, { target: { value: "2999-01-03T00:00" } });
    expect(latest.map((s) => s.date)).toEqual(["2999-01-01T00:00", "2999-01-02T00:00"]);
    expect(screen.getAllByLabelText("flag.wizard.date")[0]).toBe(first);
    fireEvent.blur(first);
    expect(latest[0].date).toBe("2999-01-03T00:00");
    const dates = screen.getAllByLabelText("flag.wizard.date") as HTMLInputElement[];
    expect(dates.map((d) => d.value)).toEqual(["2999-01-02T00:00", "2999-01-03T00:00"]);
  });

  it("removes a step", () => {
    render(<Harness initial={[step("2999-01-01T00:00")]} />);
    fireEvent.click(screen.getByRole("button", { name: "flag.detail.schedule.removeStep" }));
    expect(latest).toEqual([]);
  });

  it("shows every rule as served on the date, counting earlier steps", () => {
    render(
      <Harness
        initial={[
          step("2999-01-01T00:00", { rules: [{ ruleId: beta.id, outcome: newOutcome("off") }] }),
          step("2999-01-02T00:00", { flagState: "disable" }),
          step("2999-01-03T00:00", { flagState: "enable" }),
        ]}
      />,
    );
    const steps = screen.getAllByRole("listitem");
    expect(within(steps[0]).getByRole("button", { name: "flag.detail.schedule.undoChange:beta" })).toBeInTheDocument();
    expect(within(steps[1]).getByText("flag.detail.schedule.offNote")).toBeInTheDocument();
    expect(within(steps[1]).queryByText("beta")).toBeNull();
    for (const item of [steps[0], steps[2]]) {
      expect(within(item).getByText("flag.wizard.defaultRule")).toBeInTheDocument();
      expect(within(item).getByText("beta")).toBeInTheDocument();
      expect(within(item).getByText("ramp")).toBeInTheDocument();
    }
    expect(within(steps[2]).queryAllByText("off")).toHaveLength(2);
    expect(within(steps[2]).getByRole("switch", { name: "flag.detail.schedule.flagState" })).toBeChecked();
  });

  it("stores only what differs from the step before", () => {
    render(
      <Harness initial={[step("2999-01-01T00:00", { defaultOutcome: split(30, 70) }), step("2999-01-02T00:00")]} />,
    );
    const second = screen.getAllByRole("listitem")[1];
    fireEvent.click(
      within(second).getByRole("button", { name: "flag.detail.schedule.editServe:flag.wizard.defaultRule" }),
    );
    fireEvent.change(within(second).getByLabelText("flag.wizard.variationPercent:off"), { target: { value: "50" } });
    fireEvent.change(within(second).getByLabelText("flag.wizard.variationPercent:on"), { target: { value: "50" } });
    expect(latest[1].defaultOutcome?.percentages).toEqual({ on: 50, off: 50 });
    fireEvent.change(within(second).getByLabelText("flag.wizard.variationPercent:on"), { target: { value: "30" } });
    fireEvent.change(within(second).getByLabelText("flag.wizard.variationPercent:off"), { target: { value: "70" } });
    expect(latest[1].defaultOutcome).toBeUndefined();
  });

  it("changes a rule in place and undoes it", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[step("2999-01-01T00:00")]} />);
    edit("beta");
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "off" }));
    expect(latest[0].rules).toEqual([{ ruleId: beta.id, outcome: newOutcome("off") }]);
    expect(screen.queryByText("flag.detail.schedule.stepEmpty")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "flag.detail.schedule.undoChange:beta" }));
    expect(latest[0].rules).toEqual([]);
  });

  it("toggles the flag state against the step before", () => {
    render(<Harness initial={[step("2999-01-01T00:00", { flagState: "disable" }), step("2999-01-02T00:00")]} />);
    const [first, second] = screen.getAllByRole("listitem");
    expect(within(second).getByRole("switch", { name: "flag.detail.schedule.flagState" })).not.toBeChecked();
    fireEvent.click(within(second).getByRole("switch", { name: "flag.detail.schedule.flagState" }));
    expect(latest[1].flagState).toBe("enable");
    fireEvent.click(within(first).getByRole("switch", { name: "flag.detail.schedule.flagState" }));
    expect(latest[0].flagState).toBe("unchanged");
  });

  it("offers only single and percentage outcomes", () => {
    render(<Harness initial={[step("2999-01-01T00:00", { defaultOutcome: newOutcome("on") })]} />);
    expect(screen.getByRole("radio", { name: "flag.wizard.single" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "flag.wizard.percentage" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "flag.wizard.progressive" })).toBeNull();
  });

  it("locks progressive rules", () => {
    render(<Harness initial={[step("2999-01-01T00:00")]} />);
    expect(screen.getByText("flag.detail.schedule.progressiveLocked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "flag.detail.schedule.editServe:ramp" })).toBeNull();
  });

  it("marks a change to a rule that became progressive as invalid", () => {
    render(<Harness initial={[step("2999-01-01T00:00", { rules: [{ ruleId: ramp.id, outcome: newOutcome("on") }] })]} />);
    const item = screen.getByRole("listitem");
    expect(item.className).toContain("border-destructive");
  });

  it("notes kept changes and locks the targets they change", () => {
    const kept = {
      fields: { trackEvents: false },
      defaultRule: { query: "x" },
      targeting: [{ ruleId: beta.id, rule: { name: "beta", query: "x eq 1" } }],
    };
    render(<Harness initial={[step("2999-01-01T00:00", { kept })]} />);
    expect(screen.getByText("flag.detail.schedule.moreChanges")).toBeInTheDocument();
    expect(screen.queryByText("flag.detail.schedule.stepEmpty")).toBeNull();
    expect(screen.getAllByText("flag.detail.schedule.keptLocked")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "flag.detail.schedule.editServe:beta" })).toBeNull();
  });

  it("hides serve changes on a step that turns the flag off, and keeps them", () => {
    render(<Harness initial={[step("2999-01-01T00:00", { defaultOutcome: newOutcome("on") })]} />);
    fireEvent.click(screen.getByRole("switch", { name: "flag.detail.schedule.flagState" }));
    expect(screen.getByText("flag.detail.schedule.offNote")).toBeInTheDocument();
    expect(screen.queryByText("flag.wizard.defaultRule")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "flag.detail.schedule.flagState" }));
    expect(latest[0].defaultOutcome).toEqual(newOutcome("on"));
  });

  it("shows a full split as the one variation it serves", () => {
    render(<Harness initial={[step("2000-01-01T00:00", { defaultOutcome: split(100, 0) })]} />);
    expect(screen.queryByText("on 100% · off 0%")).toBeNull();
    expect(screen.getByText("on")).toBeInTheDocument();
  });

  it("shows a variation the split doesn't name as 0%", () => {
    render(<Harness names={["on", "off", "beta"]} initial={[step("2000-01-01T00:00", { defaultOutcome: split(60, 40) })]} />);
    expect(screen.getByText("on 60% · off 40% · beta 0%")).toBeInTheDocument();
  });

  it("states the time zone once", () => {
    render(<Harness initial={[step("2999-01-01T00:00"), step("2999-01-02T00:00")]} />);
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(screen.getAllByText(new RegExp(`flag.detail.schedule.timeZone:${zone}`))).toHaveLength(1);
  });

  it("keeps the step header to the date, the flag switch and remove", () => {
    render(<Harness initial={[step("2999-01-01T00:00")]} />);
    expect(screen.queryByRole("button", { name: /addStepAfter/ })).toBeNull();
    expect(screen.queryByText("flag.detail.schedule.changed")).toBeNull();
  });
});
