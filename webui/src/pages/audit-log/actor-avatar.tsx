import { cn } from "@/lib/utils";
import type { AuditEntry } from "@/types/api";
import { AVATAR_BG, hash, initials } from "./format";

// Circular initials badge with a stable per-actor color (hashed from email).
// System events (no actor) render a neutral "SY".
export function ActorAvatar({ e }: { e: AuditEntry }) {
  const color = e.actorEmail
    ? AVATAR_BG[hash(e.actorEmail) % AVATAR_BG.length]
    : "bg-muted-foreground";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full text-2xs font-bold text-white",
        color,
      )}
    >
      {initials(e)}
    </span>
  );
}
