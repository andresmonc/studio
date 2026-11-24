import { useTranslate } from "@refinedev/core";
import { Link } from "react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatExactDateTime, formatRelativeTime } from "@/lib/relative-time";
import type { Flagset } from "@/types/api";
import { SectionCard, SectionEmpty } from "./section-card";

// FlagsetsTable summarises the team's flagsets. "Last updated" is the flagset's
// own updatedAt, not its latest flag change (that would cost an audit call per row).
export function FlagsetsTable({ flagsets }: { flagsets: Flagset[] }) {
  const t = useTranslate();
  return (
    <SectionCard
      title={t("home.flagsets.title")}
      link={{ to: "/flagsets", label: t("home.flagsets.manage") }}
    >
      {flagsets.length === 0 ? (
        <SectionEmpty>{t("home.flagsets.empty")}</SectionEmpty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">{t("home.flagsets.name")}</TableHead>
              <TableHead className="text-right">{t("home.flagsets.flags")}</TableHead>
              <TableHead className="pr-5">{t("home.flagsets.updated")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flagsets.map((fs) => (
              <TableRow key={fs.id}>
                <TableCell className="pl-5">
                  <Link to={`/flagsets/${fs.id}`} className="hover:underline">
                    {fs.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fs.flagCount}</TableCell>
                <TableCell className="pr-5 text-muted-foreground">
                  <time dateTime={fs.updatedAt} title={formatExactDateTime(fs.updatedAt)}>
                    {formatRelativeTime(fs.updatedAt)}
                  </time>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}
