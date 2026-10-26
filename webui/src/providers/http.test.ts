import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw-server";
import { apiFetch } from "./http";
import { API_URL } from "./constants";

describe("apiFetch", () => {
  it.each([
    `${API_URL}/flagsets/x/../../teams/t1`,
    "/flags/%2e%2e/x",
    "/flags/x/.%2E/y",
    "/flags/x\\..\\y",
    "/flags/./x",
  ])("rejects dot-segment path %s", async (path) => {
    await expect(apiFetch(path)).rejects.toMatchObject({ status: 400 });
  });

  it("allows dots in the query string and inside ids", async () => {
    server.use(
      http.get(`${API_URL}/flags/a.b`, () => HttpResponse.json({ data: "ok" }))
    );
    await expect(apiFetch("/flags/a.b?x=..")).resolves.toEqual({ data: "ok" });
  });
});
