import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { TagInput } from "./tag-input";

// Controlled harness: TagInput is controlled, so re-render with the new value
// whenever onChange fires (mirrors how useFlagForm drives it).
function renderControlled(initial: string[] = [], suggestions: string[] = []) {
  const onChange = vi.fn();
  const utils = render(
    <TagInput value={initial} onChange={onChange} suggestions={suggestions} />,
  );
  // cmdk's Command.Input renders with role="combobox" (aria-autocomplete list).
  const input = () => screen.getByRole("combobox") as HTMLInputElement;
  return { onChange, input, ...utils };
}

describe("TagInput", () => {
  it("adds a tag on Enter", () => {
    const { onChange, input } = renderControlled([]);
    fireEvent.change(input(), { target: { value: "beta" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["beta"]);
  });

  it("adds a tag on comma", () => {
    const { onChange, input } = renderControlled(["beta"]);
    fireEvent.change(input(), { target: { value: "prod" } });
    fireEvent.keyDown(input(), { key: "," });
    expect(onChange).toHaveBeenCalledWith(["beta", "prod"]);
  });

  it("does not add a duplicate", () => {
    const { onChange, input } = renderControlled(["beta"]);
    fireEvent.change(input(), { target: { value: "beta" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("trims whitespace before adding", () => {
    const { onChange, input } = renderControlled([]);
    fireEvent.change(input(), { target: { value: "  beta  " } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["beta"]);
  });

  it("removes the last tag on Backspace when the input is empty", () => {
    const { onChange, input } = renderControlled(["beta", "prod"]);
    fireEvent.keyDown(input(), { key: "Backspace" });
    expect(onChange).toHaveBeenCalledWith(["beta"]);
  });

  it("removes a tag via its × button", () => {
    const { onChange } = renderControlled(["beta", "prod"]);
    fireEvent.click(screen.getByLabelText("Remove beta"));
    expect(onChange).toHaveBeenCalledWith(["prod"]);
  });

  it("suggests existing tags (minus selected) and adds one on click", () => {
    const { onChange, input } = renderControlled(["beta"], ["beta", "prod", "canary"]);
    fireEvent.change(input(), { target: { value: "c" } });
    // "canary" matches "c"; "beta" is already selected and excluded.
    const option = screen.getByText("canary");
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith(["beta", "canary"]);
  });

  it("hides remove buttons when readOnly", () => {
    render(<TagInput value={["beta"]} onChange={vi.fn()} readOnly />);
    expect(screen.queryByLabelText("Remove beta")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("stops adding at the tag-count cap and shows a hint", () => {
    render(
      <TagInput value={["a", "b"]} onChange={vi.fn()} maxTags={2} />,
    );
    // At capacity: no input to type into, and the cap hint is shown.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Maximum 2 tags reached")).toBeInTheDocument();
  });

  it("does not add a tag longer than maxTagLength and shows a hint", () => {
    const onChange = vi.fn();
    render(<TagInput value={[]} onChange={onChange} maxTagLength={3} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abcd" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByText("Tags can be at most 3 characters"),
    ).toBeInTheDocument();
  });
});

describe("TagInput draft and dropdown lifecycle", () => {
  afterEach(() => vi.useRealTimers());

  it("clears the draft without adding when a duplicate is committed with comma", () => {
    const { onChange, input } = renderControlled(["beta"]);
    fireEvent.change(input(), { target: { value: "beta" } });
    fireEvent.keyDown(input(), { key: "," });
    expect(onChange).not.toHaveBeenCalled();
    expect(input().value).toBe("");
  });

  const tests: {
    name: string;
    act: (input: HTMLInputElement) => void;
    wantOpen: boolean;
  }[] = [
    {
      name: "Escape closes the dropdown",
      act: (input) => fireEvent.keyDown(input, { key: "Escape" }),
      wantOpen: false,
    },
    {
      name: "blur closes the dropdown after a short delay",
      act: (input) => {
        fireEvent.blur(input);
        act(() => vi.advanceTimersByTime(120));
      },
      wantOpen: false,
    },
    {
      name: "a mousedown inside the dropdown cancels the pending close",
      act: (input) => {
        fireEvent.blur(input);
        fireEvent.mouseDown(screen.getByText("canary"));
        act(() => vi.advanceTimersByTime(120));
      },
      wantOpen: true,
    },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      vi.useFakeTimers();
      const { input } = renderControlled([], ["canary"]);
      fireEvent.focus(input());
      expect(screen.getByText("canary")).toBeInTheDocument();
      tt.act(input());
      expect(screen.queryByText("canary") !== null).toBe(tt.wantOpen);
    });
  }
});
