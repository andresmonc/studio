import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ identity: { data: undefined as unknown, isLoading: false } }));
vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useGetIdentity: () => h.identity,
}));

import { ProfilePage } from "./index";

const jane = {
  id: "u1",
  email: "jane@acme.com",
  name: "Jane",
  isSuperAdmin: true,
  createdAt: "2026-01-02T03:04:05Z",
  updatedAt: "2026-01-02T03:04:05Z",
  lastLoginAt: "2026-02-03T04:05:06Z",
};

describe("ProfilePage", () => {
  beforeEach(() => {
    h.identity = { data: undefined, isLoading: false };
  });

  const loading = [
    { name: "loading", identity: { data: jane, isLoading: true } },
    { name: "no identity yet", identity: { data: undefined, isLoading: false } },
  ];
  for (const tt of loading) {
    it(tt.name, () => {
      h.identity = tt.identity;
      render(<ProfilePage />);
      expect(screen.getByText("common.loading")).toBeInTheDocument();
      expect(screen.queryByText("jane@acme.com")).toBeNull();
    });
  }

  it("shows the user's details and the super admin badge", () => {
    h.identity = { data: jane, isLoading: false };
    render(<ProfilePage />);
    expect(screen.getAllByText("Jane")).toHaveLength(2);
    expect(screen.getByText("jane@acme.com")).toBeInTheDocument();
    expect(screen.getByText("profile.superAdmin")).toBeInTheDocument();
    expect(screen.getByText(new Date(jane.createdAt).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText(new Date(jane.lastLoginAt).toLocaleString())).toBeInTheDocument();
  });

  it("falls back to the email and dashes for missing fields", () => {
    h.identity = {
      data: { ...jane, name: "", avatar: "https://example.com/a.png", isSuperAdmin: false, createdAt: "not a date", lastLoginAt: undefined },
      isLoading: false,
    };
    render(<ProfilePage />);
    // Heading shows the email; the name row, created and last login show "-".
    expect(screen.getAllByText("jane@acme.com")).toHaveLength(2);
    expect(screen.getAllByText("-")).toHaveLength(3);
    expect(screen.queryByText("profile.superAdmin")).toBeNull();
  });
});
