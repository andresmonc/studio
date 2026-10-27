import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { FlagRule } from "@/types/api";
import type { Tr } from "@/components/flags/flag-form";

import {
  DefaultRuleCard,
  SettingsCard,
  TargetingCard,
  VariationsCard,
} from "./flag-detail-cards";

const t = ((key: string, params?: Record<string, unknown>) =>
  [key, ...Object.values(params ?? {})].join(" ")) as Tr;

const names = ["on", "off"];

describe("TargetingCard", () => {
  it("shows the empty state when there are no rules", () => {
    render(<TargetingCard t={t} rules={[]} names={names} />);
    expect(screen.getByText("flag.detail.noRules")).toBeInTheDocument();
  });

  const tests: { name: string; rule: FlagRule; want: string[]; absent?: string[] }[] = [
    {
      name: "single variation",
      rule: { name: "beta", query: 'key eq "a"', variation: "off" },
      want: ["beta", 'key eq "a"', "off"],
    },
    {
      name: "percentage split",
      rule: { query: "q", percentage: { on: 30, off: 70 } },
      want: ["30%", "70%"],
    },
    {
      name: "percentage split missing a variation weight",
      rule: { query: "q", percentage: { on: 100 } },
      want: ["100%", "0%"],
    },
    {
      name: "progressive rollout",
      rule: {
        query: "q",
        progressiveRollout: {
          initial: { variation: "off", percentage: 10, date: "2026-01-01T00:00:00Z" },
          end: { variation: "on", percentage: 90, date: "2026-02-01T00:00:00Z" },
        },
      },
      want: ["flag.detail.progressive", "off", "on", "flag.detail.progressiveRange 10 90"],
    },
    {
      name: "progressive rollout without variations uses default range",
      rule: { query: "q", progressiveRollout: {} },
      want: ["flag.detail.progressiveRange 0 100"],
      absent: ["on", "off"],
    },
    {
      name: "rule without outcome",
      rule: { query: "q" },
      want: ["—"],
    },
  ];
  for (const tt of tests) {
    it(`renders a rule with ${tt.name}`, () => {
      render(<TargetingCard t={t} rules={[tt.rule]} names={names} />);
      expect(screen.getByText("RULE 1")).toBeInTheDocument();
      for (const w of tt.want) expect(screen.getByText(w)).toBeInTheDocument();
      for (const a of tt.absent ?? []) expect(screen.queryByText(a)).not.toBeInTheDocument();
    });
  }
});

describe("DefaultRuleCard", () => {
  const tests: { name: string; rule: FlagRule | undefined; label: string | null }[] = [
    { name: "single variation is served", rule: { variation: "on" }, label: "flag.detail.serve" },
    {
      name: "percentage is split",
      rule: { percentage: { on: 50, off: 50 } },
      label: "flag.detail.split",
    },
    { name: "missing rule has no label", rule: undefined, label: null },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      render(<DefaultRuleCard t={t} rule={tt.rule} names={names} />);
      for (const l of ["flag.detail.serve", "flag.detail.split"]) {
        if (l === tt.label) expect(screen.getByText(l)).toBeInTheDocument();
        else expect(screen.queryByText(l)).not.toBeInTheDocument();
      }
      if (!tt.rule) expect(screen.getByText("—")).toBeInTheDocument();
    });
  }
});

describe("VariationsCard", () => {
  it("lists each variation with its formatted value", () => {
    render(
      <VariationsCard
        t={t}
        payload={{ variations: { on: { color: "red" }, off: "plain" } }}
        names={names}
      />,
    );
    expect(screen.getByText('{"color":"red"}')).toBeInTheDocument();
    expect(screen.getByText("plain")).toBeInTheDocument();
  });
});

describe("SettingsCard", () => {
  function renderCard(props: Partial<Parameters<typeof SettingsCard>[0]> = {}) {
    return render(
      <MemoryRouter>
        <SettingsCard
          t={t}
          metadata={undefined}
          trackEvents
          flagsetId="fs-1"
          flagsetName=""
          createdByName=""
          {...props}
        />
      </MemoryRouter>,
    );
  }

  it("falls back to placeholders when metadata is empty", () => {
    renderCard({ trackEvents: false });
    // Flagset link falls back to the id while the name loads.
    expect(screen.getByRole("link", { name: "fs-1" })).toHaveAttribute("href", "/flagsets/fs-1");
    expect(screen.getAllByText("—")).toHaveLength(2); // creator + tags
    expect(screen.getByText("flag.detail.disabled")).toBeInTheDocument();
    expect(screen.getByText("flag.detail.metadataEmpty")).toBeInTheDocument();
  });

  it("shows reserved metadata, tags and creator, hiding custom keys", () => {
    renderCard({
      flagsetName: "Checkout",
      createdByName: "Jane",
      metadata: {
        owner: "alice",
        description: "A feature",
        tags: ["beta", "prod"],
        team: "payments",
      },
    });
    expect(screen.getByRole("link", { name: "Checkout" })).toBeInTheDocument();
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.getByText("flag.detail.enabled")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("A feature")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.getByText("prod")).toBeInTheDocument();
    // Tags render as chips, not as a generic key/value row.
    expect(
      within(screen.getByText("owner").closest("dl")!).queryByText("tags"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("payments")).not.toBeInTheDocument();
    expect(screen.queryByText("flag.detail.metadataEmpty")).not.toBeInTheDocument();
  });
});
