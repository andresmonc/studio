import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw-server";
import { dataProvider } from "./data";
import { API_URL } from "./constants";
import type { Team } from "@/types/api";

const sampleTeam: Team = {
  id: "t1",
  companyId: "c1",
  name: "alpha",
  description: "",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("dataProvider", () => {
  it("getList unwraps APIResponse.data array", async () => {
    server.use(
      http.get(`${API_URL}/teams`, () =>
        HttpResponse.json({ data: [sampleTeam] })
      )
    );
    const res = await dataProvider.getList({ resource: "teams" });
    expect(res.total).toBe(1);
    expect(res.data[0]).toMatchObject({ id: "t1", name: "alpha" });
  });

  it("create POSTs and unwraps data", async () => {
    server.use(
      http.post(`${API_URL}/teams`, async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json(
          {
            data: { ...sampleTeam, name: body.name },
          },
          { status: 201 }
        );
      })
    );
    const res = await dataProvider.create({
      resource: "teams",
      variables: { name: "beta" },
    });
    expect(res.data).toMatchObject({ name: "beta" });
  });

  it("surfaces message on error", async () => {
    server.use(
      http.post(`${API_URL}/teams`, () =>
        HttpResponse.json(
          { message: "name is required" },
          { status: 400 }
        )
      )
    );
    await expect(
      dataProvider.create({ resource: "teams", variables: {} })
    ).rejects.toThrow("name is required");
  });
});

describe("dataProvider contract", () => {
  it("getList reads total from a paginated body and sends page/pageSize/eq filters", async () => {
    let url = "";
    server.use(
      http.get(`${API_URL}/flagsets/fs1/flags`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          data: [{ id: "f1" }],
          total: 42,
          page: 2,
          pageSize: 10,
          totalPages: 5,
        });
      })
    );
    const res = await dataProvider.getList({
      resource: "flags",
      meta: { path: "/flagsets/fs1/flags" },
      pagination: { currentPage: 2, pageSize: 10 },
      filters: [{ field: "disabled", operator: "eq", value: true }],
    });
    expect(res.total).toBe(42);
    expect(res.data).toEqual([{ id: "f1" }]);
    const qs = new URL(url).searchParams;
    expect(qs.get("page")).toBe("2");
    expect(qs.get("pageSize")).toBe("10");
    expect(qs.get("disabled")).toBe("true");
  });

  it("update honors meta.method", async () => {
    let method = "";
    server.use(
      http.put(`${API_URL}/flags/f1`, ({ request }) => {
        method = request.method;
        return HttpResponse.json({ data: { id: "f1" } });
      })
    );
    await dataProvider.update({
      resource: "flags",
      id: "f1",
      variables: {},
      meta: { method: "put" },
    });
    expect(method).toBe("PUT");
  });

  it("custom returns paginated bodies whole and unwraps plain ones", async () => {
    server.use(
      http.get(`${API_URL}/audit`, () =>
        HttpResponse.json({ data: [], total: 0, page: 1, pageSize: 50, totalPages: 0 })
      ),
      http.get(`${API_URL}/teams/t1`, () =>
        HttpResponse.json({ data: sampleTeam })
      )
    );
    const page = await dataProvider.custom!({ url: `${API_URL}/audit`, method: "get" });
    expect(page.data).toMatchObject({ data: [], total: 0 });
    const one = await dataProvider.custom!({ url: `${API_URL}/teams/t1`, method: "get" });
    expect(one.data).toMatchObject({ id: "t1" });
  });
});

describe("apiFetch headers", () => {
  it("keeps Content-Type when custom passes headers: undefined", async () => {
    let ct: string | null = null;
    server.use(
      http.post(`${API_URL}/flags/f1/disable`, ({ request }) => {
        ct = request.headers.get("content-type");
        return HttpResponse.json({});
      })
    );
    await dataProvider.custom!({
      url: `${API_URL}/flags/f1/disable`,
      method: "post",
      payload: { disabled: true },
    });
    expect(ct).toBe("application/json");
  });
});

describe("dataProvider getOne/deleteOne", () => {
  const tests: {
    name: string;
    call: () => Promise<{ data: unknown }>;
    method: "get" | "delete";
    path: string;
    reply: Record<string, unknown>;
    want: unknown;
  }[] = [
    {
      name: "getOne hits resource/id and unwraps data",
      call: () => dataProvider.getOne({ resource: "teams", id: "t1" }),
      method: "get",
      path: "/teams/t1",
      reply: { data: sampleTeam },
      want: sampleTeam,
    },
    {
      name: "getOne honors meta.path",
      call: () =>
        dataProvider.getOne({
          resource: "flags",
          id: "f1",
          meta: { path: "/flagsets/fs1/flags" },
        }),
      method: "get",
      path: "/flagsets/fs1/flags/f1",
      reply: { data: { id: "f1" } },
      want: { id: "f1" },
    },
    {
      name: "deleteOne unwraps data",
      call: () => dataProvider.deleteOne({ resource: "teams", id: "t1" }),
      method: "delete",
      path: "/teams/t1",
      reply: { data: { id: "t1" } },
      want: { id: "t1" },
    },
    {
      name: "deleteOne returns null when the body has no data",
      call: () => dataProvider.deleteOne({ resource: "teams", id: "t2" }),
      method: "delete",
      path: "/teams/t2",
      reply: {},
      want: null,
    },
  ];

  for (const tt of tests) {
    it(tt.name, async () => {
      server.use(
        http[tt.method](`${API_URL}${tt.path}`, () => HttpResponse.json(tt.reply))
      );
      const res = await tt.call();
      expect(res.data).toEqual(tt.want);
    });
  }
});
