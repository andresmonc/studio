import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useRefineOptions } from "@refinedev/core";

export const Header = () => {
  const { isMobile } = useSidebar();

  // Desktop has no top bar: the sidebar already carries navigation and the user menu.
  return isMobile ? <MobileHeader /> : null;
};

function MobileHeader() {
  const { title } = useRefineOptions();

  return (
    <header
      className={cn(
        "sticky",
        "top-0",
        "flex",
        "h-12",
        "shrink-0",
        "items-center",
        "gap-2",
        "border-b",
        "border-border",
        "bg-sidebar",
        "px-1",
        "justify-start",
        "z-40",
      )}
    >
      <SidebarTrigger className={cn("text-muted-foreground", "rotate-180")} />

      <div
        className={cn(
          "whitespace-nowrap",
          "flex",
          "flex-row",
          "h-full",
          "items-center",
          "justify-start",
          "gap-2",
        )}
      >
        <div>{title.icon}</div>
        <h2 className={cn("text-sm", "font-bold")}>{title.text}</h2>
      </div>
    </header>
  );
}
