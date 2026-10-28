import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { DragHandleProps } from "react-querybuilder";
import { ShadcnUiDragHandle } from "./ShadcnUiDragHandle";

describe("ShadcnUiDragHandle", () => {
  it("forwards the drag ref and renders the grip icon", () => {
    const ref = createRef<HTMLSpanElement>();
    const props = { className: "handle", title: "Drag", path: [0], level: 1, schema: {} } as unknown as DragHandleProps;
    const { container } = render(<ShadcnUiDragHandle {...props} ref={ref} />);
    const span = container.querySelector("span");
    expect(ref.current).toBe(span);
    expect(span).toHaveClass("handle");
    expect(span).toHaveAttribute("title", "Drag");
    expect(span?.querySelector("svg")).not.toBeNull();
  });
});
