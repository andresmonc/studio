import { describe, expect, it } from "vitest";
import { HttpError } from "@/providers/http";
import { errMessage } from "./errors";

describe("errMessage", () => {
  const tests = [
    { name: "plain http error", err: new HttpError("not found", 404), want: "not found" },
    {
      name: "appends field errors",
      err: new HttpError("validation failed", 400, {
        payload: ["duplicated rule name"],
        name: ["must not contain spaces", "too long"],
      }),
      want: "validation failed (payload: duplicated rule name; name: must not contain spaces, too long)",
    },
    { name: "empty field errors", err: new HttpError("conflict", 409, {}), want: "conflict" },
    { name: "error-like object", err: { message: "boom" }, want: "boom" },
    { name: "unknown value", err: 42, want: "Unexpected error" },
  ];
  for (const tt of tests) {
    it(tt.name, () => expect(errMessage(tt.err)).toBe(tt.want));
  }
});
