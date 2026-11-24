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

  it("prefixes a path without a leading slash and returns {} for an empty body", async () => {
    server.use(
      http.post(`${API_URL}/flags/f1/disable`, () => new HttpResponse(null, { status: 204 }))
    );
    await expect(apiFetch("flags/f1/disable", { method: "POST" })).resolves.toEqual({});
  });

  it("reports the status when an error body is not JSON", async () => {
    server.use(
      http.get(`${API_URL}/flags`, () => new HttpResponse("Bad Gateway", { status: 502 }))
    );
    await expect(apiFetch("/flags")).rejects.toMatchObject({
      message: "Request failed with status 502",
      status: 502,
    });
  });

  it("allows dots in the query string and inside ids", async () => {
    server.use(
      http.get(`${API_URL}/flags/a.b`, () => HttpResponse.json({ data: "ok" }))
    );
    await expect(apiFetch("/flags/a.b?x=..")).resolves.toEqual({ data: "ok" });
  });
});
