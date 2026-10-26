import type { Meta, StoryObj } from "@storybook/react-vite";

import { CodeBlock } from "./code-block";

const GO_SAMPLE = `package main

import (
	ffclient "github.com/thomaspoignant/go-feature-flag"
)

func main() {
	user := ffcontext.NewEvaluationContext("user-123")
	hasFlag, _ := ffclient.BoolVariation("new-feature", user, false)
	if hasFlag {
		// flag is enabled
	}
}`;

const YAML_SAMPLE = `new-feature:
  variations:
    enabled: true
    disabled: false
  defaultRule:
    percentage:
      enabled: 50
      disabled: 50`;

const meta = {
  title: "UI/CodeBlock",
  component: CodeBlock,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Prism-based syntax highlighter. It follows the app theme provider, so use the Theme toolbar to preview light/dark highlighting.",
      },
    },
  },
  argTypes: {
    language: {
      control: "select",
      options: ["go", "yaml", "json", "typescript", "python"],
    },
    rounded: { control: "boolean" },
  },
  args: { code: GO_SAMPLE, language: "go", rounded: true },
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Go: Story = {};

export const Yaml: Story = {
  args: { code: YAML_SAMPLE, language: "yaml" },
};

export const NotRounded: Story = {
  args: { rounded: false },
};
