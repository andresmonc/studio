import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
    <Avatar aria-hidden="true" className="size-6">
      <AvatarFallback className={cn("text-2xs font-bold text-white", color)}>
        {initials(e)}
      </AvatarFallback>
    </Avatar>
  );
}
