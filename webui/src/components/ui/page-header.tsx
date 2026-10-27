import { useTranslate } from "@refinedev/core";
import { Home } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";

export type Crumb = { label: ReactNode; to?: string; className?: string };

// PageBreadcrumb renders the home link followed by `items` over a full-width
// rule. An item without `to` is the current page.
export function PageBreadcrumb({ items }: { items: Crumb[] }) {
  const t = useTranslate();
  return (
    <div className="relative flex items-center gap-2">
      <div className="z-[2] bg-background pr-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/" aria-label={t("nav.home")}>
                  <Home className="h-4 w-4" />
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {items.map((c, i) => (
              <Fragment key={i}>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {c.to ? (
                    <BreadcrumbLink asChild>
                      <Link to={c.to} className={c.className}>
                        {c.label}
                      </Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className={c.className}>{c.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <Separator className="absolute left-0 right-0 z-[1]" />
    </div>
  );
}

// PageHeader is the top of a page: optional breadcrumb, then the title and
// description with `children` (the page actions) aligned to the right. It
// returns siblings so the page's own vertical gap spaces them.
export function PageHeader({
  breadcrumb,
  title,
  description,
  children,
}: {
  breadcrumb?: Crumb[];
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      {breadcrumb && <PageBreadcrumb items={breadcrumb} />}
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {children}
      </div>
    </>
  );
}
