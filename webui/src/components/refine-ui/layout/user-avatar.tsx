import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useGetIdentity } from "@refinedev/core";
import { UserRound } from "lucide-react";

type User = {
  id: string;
  email: string;
  name: string;
  avatar?: string;
};

export function UserAvatar() {
  const { data: user, isLoading: userIsLoading } = useGetIdentity<User>();

  if (userIsLoading || !user) {
    return <Skeleton className={cn("h-10", "w-10", "rounded-full")} />;
  }

  const { name, avatar } = user;

  return (
    <Avatar className={cn("h-10", "w-10")}>
      {avatar && <AvatarImage src={avatar} alt={name} />}
      <AvatarFallback>
        <UserRound className={cn("h-5", "w-5", "text-muted-foreground")} />
      </AvatarFallback>
    </Avatar>
  );
}

UserAvatar.displayName = "UserAvatar";
