import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ identity: { data: undefined as unknown, isLoading: false } }));
vi.mock("@refinedev/core", () => ({
  useGetIdentity: () => h.identity,
}));
vi.mock("@refinedev/react-router", () => ({
  NavigateToResource: ({ resource }: { resource: string }) => <div>navigate to {resource}</div>,
}));

import { HomeRoute } from "./home-route";

describe("HomeRoute", () => {
  const tests = [
    { name: "loading renders nothing", identity: { data: { isSuperAdmin: true }, isLoading: true }, want: null },
    { name: "no identity renders nothing", identity: { data: undefined, isLoading: false }, want: null },
    { name: "super admin lands on teams", identity: { data: { isSuperAdmin: true }, isLoading: false }, want: "navigate to teams" },
    { name: "user lands on flags", identity: { data: { isSuperAdmin: false }, isLoading: false }, want: "navigate to flags" },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      h.identity = tt.identity;
      const { container } = render(<HomeRoute />);
      if (tt.want) expect(screen.getByText(tt.want)).toBeInTheDocument();
      else expect(container).toBeEmptyDOMElement();
    });
  }
});
