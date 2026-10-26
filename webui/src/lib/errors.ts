import { HttpError } from "@/providers/http";

export function errMessage(err: unknown): string {
  if (err instanceof HttpError) {
    // The server's message is generic ("validation failed"); the per-field
    // errors carry the actual reason, so surface them in the toast too.
    const details = Object.entries(err.errors ?? {})
      .map(([field, msgs]) => `${field}: ${msgs.join(", ")}`)
      .join("; ");
    return details ? `${err.message} (${details})` : err.message;
  }
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message ?? "");
  }
  return "Unexpected error";
}
