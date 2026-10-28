import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { VariationPill } from "./variation-pill";

describe("VariationPill", () => {
  it("renders a variation pill with name and value", () => {
    const { getByText } = render(
      <VariationPill name="on" index={0} value="true" />,
    );
    expect(getByText("on")).toBeInTheDocument();
    expect(getByText("true")).toBeInTheDocument();
  });
});
