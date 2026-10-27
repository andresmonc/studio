import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { FLAG, FLAGSETS } from "../../../.storybook/fixtures";
import { variationsForType } from "@/components/flags/flag-form";
import { i18nProvider } from "@/providers/i18n";
import type { FlagType } from "@/types/api";
import { BasicsStep, ReviewStep, Stepper, WizSidekick } from "./flag-wizard-steps";

const t = i18nProvider.translate;

function StatefulBasicsStep({ filled }: { filled?: boolean }) {
  const [flagsetId, setFlagsetId] = useState(filled ? FLAGSETS[0].id : "");
  const [name, setName] = useState(filled ? "checkout-redesign" : "");
  const [description, setDescription] = useState(
    filled ? "New one-page checkout flow" : "",
  );
  const [type, setType] = useState<FlagType>("boolean");
  const [variations, setVariations] = useState(variationsForType("boolean"));
  const [tags, setTags] = useState(filled ? ["checkout", "q4-launch"] : []);
  const [enableOnSave, setEnableOnSave] = useState(!!filled);
  return (
    <BasicsStep
      t={t}
      flagsets={FLAGSETS}
      flagsetId={flagsetId}
      setFlagsetId={setFlagsetId}
      name={name}
      setName={setName}
      description={description}
      setDescription={setDescription}
      type={type}
      onTypeChange={(next) => {
        setType(next);
        setVariations(variationsForType(next));
      }}
      variations={variations}
      setVariations={setVariations}
      tags={tags}
      setTags={setTags}
      tagSuggestions={["experiment", "mobile", "search"]}
      enableOnSave={enableOnSave}
      setEnableOnSave={setEnableOnSave}
    />
  );
}

function StatefulReviewStep() {
  const [comment, setComment] = useState("feat(flags): add checkout redesign");
  return (
    <ReviewStep
      t={t}
      payload={FLAG.payload as Record<string, unknown>}
      name={FLAG.name}
      comment={comment}
      setComment={setComment}
    />
  );
}

const meta = {
  title: "Pages/Flags/FlagWizardSteps",
  component: Stepper,
  tags: ["autodocs"],
  args: { step: 1, t },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Stepper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StepperBasics: Story = {};
export const StepperRules: Story = { args: { step: 2 } };
export const StepperReview: Story = { args: { step: 3 } };

export const Basics: Story = { render: () => <StatefulBasicsStep /> };
export const BasicsFilled: Story = { render: () => <StatefulBasicsStep filled /> };

export const SidekickIncomplete: Story = {
  render: () => (
    <WizSidekick
      step={1}
      t={t}
      checks={[
        { label: t("flag.wizard.checkFlagset"), ok: true },
        { label: t("flag.wizard.checkKey"), ok: false },
        { label: t("flag.wizard.checkVariations"), ok: false },
      ]}
    />
  ),
};
export const SidekickReady: Story = {
  render: () => (
    <WizSidekick
      step={3}
      t={t}
      checks={[{ label: t("flag.wizard.checkReady"), ok: true }]}
    />
  ),
};

export const Review: Story = { render: () => <StatefulReviewStep /> };
