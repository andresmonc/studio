import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

const setActiveCompanyId = vi.fn();
vi.mock("@/hooks/use-active-company", () => ({
  useActiveCompany: () => ({ setActiveCompanyId }),
}));

import { CompanyEditPage } from "./edit";

describe("CompanyEditPage", () => {
  beforeEach(() => setActiveCompanyId.mockReset());

  const tests = [
    { name: "selects the company and opens its page", path: "/companies/edit/c1", wantPage: "company page", wantActive: "c1" },
    { name: "no id goes back to the list", path: "/companies/edit", wantPage: "companies page", wantActive: undefined },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      render(
        <MemoryRouter initialEntries={[tt.path]}>
          <Routes>
            <Route path="/companies/edit/:id" element={<CompanyEditPage />} />
            <Route path="/companies/edit" element={<CompanyEditPage />} />
            <Route path="/company" element={<div>company page</div>} />
            <Route path="/companies" element={<div>companies page</div>} />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.getByText(tt.wantPage)).toBeInTheDocument();
      if (tt.wantActive) expect(setActiveCompanyId).toHaveBeenCalledWith(tt.wantActive);
      else expect(setActiveCompanyId).not.toHaveBeenCalled();
    });
  }
});
