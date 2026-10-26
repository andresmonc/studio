import { apiFetch } from "./http";
import type { UIConfig } from "@/types/api";

// Multi-company defaults: if /config is unreachable the UI keeps every
// feature visible and the server still enforces mono company mode.
let config: UIConfig = { monoCompany: false };

// loadUIConfig fetches the public /config once, before the app renders.
export async function loadUIConfig(): Promise<void> {
  try {
    const body = await apiFetch<UIConfig>("/config");
    if (body.data) config = body.data;
  } catch {
    // keep defaults
  }
}

export function isMonoCompany(): boolean {
  return config.monoCompany;
}
