import type { Meta, StoryObj } from "@storybook/react-vite";

import { FLAG } from "../../../.storybook/fixtures";
import { i18nProvider } from "@/providers/i18n";
import {
  DefaultRuleCard,
  SettingsCard,
  TargetingCard,
  VariationsCard,
} from "./flag-detail-cards";

const t = i18nProvider.translate;
const payload = FLAG.payload!;
const names = Object.keys(payload.variations!);
const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

const meta = {
  title: "Pages/Flags/FlagDetailCards",
  component: TargetingCard,
  tags: ["autodocs"],
  args: { t, rules: payload.targeting!, names },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TargetingCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Targeting: Story = {};
export const TargetingEmpty: Story = { args: { rules: [] } };

export const DefaultRuleSingle: Story = {
  render: () => (
    <DefaultRuleCard t={t} rule={payload.defaultRule} names={names} />
  ),
};
export const DefaultRulePercentage: Story = {
  render: () => (
    <DefaultRuleCard
      t={t}
      rule={{ percentage: { enabled: 25, disabled: 75 } }}
      names={names}
    />
  ),
};
export const DefaultRuleProgressive: Story = {
  render: () => (
    <DefaultRuleCard
      t={t}
      rule={{
        progressiveRollout: {
          initial: { variation: "disabled", percentage: 0, date: inDays(-2) },
          end: { variation: "enabled", percentage: 100, date: inDays(5) },
        },
      }}
      names={names}
    />
  ),
};
export const DefaultRuleMissing: Story = {
  render: () => <DefaultRuleCard t={t} rule={undefined} names={names} />,
};

export const Variations: Story = {
  render: () => <VariationsCard t={t} payload={payload} names={names} />,
};
export const VariationsJson: Story = {
  render: () => (
    <VariationsCard
      t={t}
      payload={{
        variations: {
          compact: { columns: 2, showPrices: false },
          full: { columns: 4, showPrices: true },
        },
      }}
      names={["compact", "full"]}
    />
  ),
};

export const Settings: Story = {
  render: () => (
    <SettingsCard
      t={t}
      metadata={payload.metadata}
      trackEvents
      flagsetId="fs-web"
      flagsetName="web-storefront"
      createdByName="Ada Lovelace"
    />
  ),
};
export const SettingsEmpty: Story = {
  render: () => (
    <SettingsCard
      t={t}
      metadata={undefined}
      trackEvents={false}
      flagsetId="fs-web"
      flagsetName=""
      createdByName=""
    />
  ),
};
