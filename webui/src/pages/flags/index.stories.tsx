import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  FLAG_INSTANCES,
  IDENTITIES,
  LOADING,
  paginated,
} from "../../../.storybook/fixtures";
import { FlagsPage } from "./index";

const LIST = "/teams/t-core/flags?page=1&pageSize=50";

const meta = {
  title: "Pages/Flags/FlagsPage",
  component: FlagsPage,
  tags: ["autodocs"],
  parameters: {
    identity: IDENTITIES.member,
    route: { path: "/flags", url: "/flags" },
  },
} satisfies Meta<typeof FlagsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// Editors get the "Create flag" wizard and live state switches.
export const Editor: Story = {};
export const Viewer: Story = { parameters: { identity: IDENTITIES.viewer } };

// Filters live in the URL and are applied server-side.
export const Filtered: Story = {
  parameters: {
    route: { path: "/flags", url: "/flags?state=disabled" },
    data: {
      "/teams/t-core/flags?disabled=true&page=1&pageSize=50": paginated(
        FLAG_INSTANCES.filter((f) => f.disabled),
      ),
    },
  },
};
export const Empty: Story = { parameters: { data: { [LIST]: paginated([]) } } };
export const Loading: Story = { parameters: { data: { [LIST]: LOADING } } };
// No team to show flags for (a company admin with no membership).
export const NoTeam: Story = {
  parameters: { identity: IDENTITIES.companyAdmin },
};
// `?create=1` (the sidebar "Create" link) opens the wizard.
export const CreateWizard: Story = {
  parameters: { route: { path: "/flags", url: "/flags?create=1" } },
};
