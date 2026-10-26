import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw-server";
import { isMonoCompany, loadUIConfig } from "./ui-config";
import { API_URL } from "./constants";

const configEndpoint = `${API_URL}/config`;

describe("ui-config", () => {
  it("keeps multi-company defaults when /config fails", async () => {
    server.use(http.get(configEndpoint, () => HttpResponse.error()));
    await loadUIConfig();
    expect(isMonoCompany()).toBe(false);
  });

  it("reads monoCompany from /config", async () => {
    server.use(
      http.get(configEndpoint, () =>
        HttpResponse.json({ data: { monoCompany: true } }),
      ),
    );
    await loadUIConfig();
    expect(isMonoCompany()).toBe(true);
  });
});
