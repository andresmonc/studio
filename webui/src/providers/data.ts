import type {
  CrudFilters,
  DataProvider,
  MetaQuery,
  Pagination,
} from "@refinedev/core";
import { API_URL } from "./constants";
import { apiFetch } from "./http";

type Meta = MetaQuery | undefined; // uses meta.path and meta.method

// meta.path lets nested resources (e.g. `/teams/${id}/flagsets`) go through
// the resource hooks; otherwise the resource name is the path.
function resourcePath(resource: string, meta: Meta, id?: string | number): string {
  const base = meta?.path ?? `/${resource}`;
  return id !== undefined ? `${base}/${id}` : base;
}

// Server contract: `page`/`pageSize` for pagination, `field=value` for eq
// filters. Sorters are ignored: the only sortable list (team flags) builds
// its own query via useCustom.
function listQuery(pagination?: Pagination, filters?: CrudFilters): string {
  const qs = new URLSearchParams();
  if (pagination?.mode !== "off") {
    if (pagination?.currentPage)
      qs.set("page", String(pagination.currentPage));
    if (pagination?.pageSize) qs.set("pageSize", String(pagination.pageSize));
  }
  for (const f of filters ?? []) {
    if ("field" in f && f.operator === "eq" && f.value !== undefined && f.value !== "") {
      qs.set(f.field, String(f.value));
    }
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const dataProvider: DataProvider = {
  getApiUrl: () => API_URL,

  getList: async ({ resource, pagination, filters, meta }) => {
    const body = await apiFetch<unknown[]>(
      resourcePath(resource, meta) + listQuery(pagination, filters)
    );
    const data = body.data ?? [];
    return { data: data as never, total: body.total ?? data.length };
  },

  getOne: async ({ resource, id, meta }) => {
    const body = await apiFetch<unknown>(resourcePath(resource, meta, id));
    return { data: body.data as never };
  },

  create: async ({ resource, variables, meta }) => {
    const body = await apiFetch<unknown>(resourcePath(resource, meta), {
      method: "POST",
      body: JSON.stringify(variables),
    });
    return { data: body.data as never };
  },

  update: async ({ resource, id, variables, meta }) => {
    const body = await apiFetch<unknown>(resourcePath(resource, meta, id), {
      method: (meta?.method as string | undefined)?.toUpperCase() ?? "PATCH",
      body: JSON.stringify(variables),
    });
    return { data: body.data as never };
  },

  deleteOne: async ({ resource, id, meta }) => {
    const body = await apiFetch<unknown>(resourcePath(resource, meta, id), {
      method: "DELETE",
    });
    return { data: (body.data ?? null) as never };
  },

  custom: async ({ url, method = "get", payload, headers }) => {
    const body = await apiFetch<unknown>(url, {
      method: method.toUpperCase(),
      body: payload ? JSON.stringify(payload) : undefined,
      headers: headers as Record<string, string> | undefined,
    });
    // Paginated bodies are returned whole so callers keep total/page/pageSize.
    return { data: (body.total !== undefined ? body : body.data) as never };
  },
};
