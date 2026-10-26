import { useEffect, useRef, useState } from "react";
import { useTranslate } from "@refinedev/core";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// `number` is a single combined numeric type (used by flagset enrichment), while
// `int`/`float` are the split numeric types used by flag metadata. A caller picks
// the subset it wants via the `types` prop.
export type EnrichType =
  | "string"
  | "number"
  | "int"
  | "float"
  | "boolean"
  | "json";

type Row = {
  id: number;
  key: string;
  type: EnrichType;
  value: string;
};

const ALL_TYPES: EnrichType[] = ["string", "number", "boolean", "json"];

// Coerce a row's raw string value to its typed JS value. Returns an error key
// (i18n) when the value is invalid for its type.
function coerce(
  row: Row,
): { ok: true; value: unknown } | { ok: false; error: string } {
  switch (row.type) {
    case "number":
    case "float": {
      if (row.value.trim() === "" || Number.isNaN(Number(row.value))) {
        return { ok: false, error: "flagset.enrichmentInvalidNumber" };
      }
      return { ok: true, value: Number(row.value) };
    }
    case "int": {
      if (row.value.trim() === "" || !Number.isInteger(Number(row.value))) {
        return { ok: false, error: "flagset.enrichmentInvalidInt" };
      }
      return { ok: true, value: Number(row.value) };
    }
    case "boolean":
      return { ok: true, value: row.value === "true" };
    case "json": {
      try {
        return { ok: true, value: JSON.parse(row.value) };
      } catch {
        return { ok: false, error: "flagset.enrichmentInvalidJson" };
      }
    }
    default:
      return { ok: true, value: row.value };
  }
}

type Props = {
  onChange: (obj: Record<string, unknown>, valid: boolean) => void;
  initial?: Record<string, unknown> | null;
  readOnly?: boolean;
  // Restrict the type dropdown (e.g. flag metadata omits "json"). Defaults to all.
  types?: EnrichType[];
  // Keys that may not be edited here (e.g. flag metadata's owner/description, which
  // have dedicated UI elsewhere). Seeded rows with these keys are dropped, and a
  // row whose key collides with a reserved key is flagged invalid.
  reservedKeys?: Set<string>;
  // Render only the bordered table, without the outer label/badge/hint chrome.
  // Used when the caller (e.g. a Card header) supplies its own surrounding context.
  hideChrome?: boolean;
};

// Infer the editor type + string value from a stored JSON value. The numeric type
// depends on which types the caller offers: a combined `number`, or split
// `int`/`float` (flag metadata) chosen by whether the value is a whole number.
function numericType(value: number, types: EnrichType[]): EnrichType {
  if (types.includes("number")) return "number";
  if (Number.isInteger(value) && types.includes("int")) return "int";
  if (types.includes("float")) return "float";
  return "string";
}

function rowsFromObject(
  obj: Record<string, unknown> | null | undefined,
  startId: number,
  types: EnrichType[],
): Row[] {
  if (!obj) return [];
  return Object.entries(obj).map(([key, value], i) => {
    let type: EnrichType = "string";
    let str = "";
    if (typeof value === "boolean") {
      type = "boolean";
      str = value ? "true" : "false";
    } else if (typeof value === "number") {
      type = numericType(value, types);
      str = String(value);
    } else if (typeof value === "string") {
      type = "string";
      str = value;
    } else {
      type = "json";
      str = JSON.stringify(value);
    }
    return { id: startId + i, key, type, value: str };
  });
}

export function EnrichmentEditor({
  onChange,
  initial,
  readOnly,
  types = ALL_TYPES,
  reservedKeys,
  hideChrome,
}: Props) {
  const t = useTranslate();
  // Reserved keys are owned by other UI, so never seed or display them here.
  const seedSource = reservedKeys
    ? Object.fromEntries(
        Object.entries(initial ?? {}).filter(([k]) => !reservedKeys.has(k)),
      )
    : initial;
  const seeded = rowsFromObject(seedSource, 1, types);
  const nextId = useRef(seeded.length + 1);
  const [rows, setRows] = useState<Row[]>(seeded);

  // Resolve the current rows into the typed object + an overall validity flag.
  const resolve = (rs: Row[]): { obj: Record<string, unknown>; valid: boolean } => {
    const obj: Record<string, unknown> = {};
    let valid = true;
    for (const r of rs) {
      const key = r.key.trim();
      if (key === "") continue; // ignore incomplete rows
      if (reservedKeys?.has(key)) {
        valid = false; // reserved keys are edited elsewhere
        continue;
      }
      const c = coerce(r);
      if (!c.ok) {
        valid = false;
        continue;
      }
      obj[key] = c.value;
    }
    return { obj, valid };
  };

  const emit = (next: Row[]) => {
    setRows(next);
    const { obj, valid } = resolve(next);
    onChange(obj, valid);
  };

  const addRow = () =>
    emit([
      ...rows,
      { id: nextId.current++, key: "", type: "string", value: "" },
    ]);
  const removeRow = (id: number) => emit(rows.filter((r) => r.id !== id));
  const patch = (id: number, p: Partial<Row>) =>
    emit(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));

  // Report the seeded object once on mount so the parent has the initial value.
  useEffect(() => {
    const { obj, valid } = resolve(rows);
    onChange(obj, valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {!hideChrome && (
        <div className="mb-2 flex items-center gap-2">
          <label className="text-sm font-medium">
            {t("flagset.enrichmentLabel")}{" "}
            <span className="font-normal text-muted-foreground">
              · {t("common.optional")}
            </span>
          </label>
          <Badge
            variant="secondary"
            className="ml-auto font-normal"
            title={t("flagset.enrichmentHint")}
          >
            {t("flagset.enrichmentBadge")}
          </Badge>
        </div>
      )}

      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-[1fr_120px_1fr_36px] gap-2 border-b bg-muted/50 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>{t("flagset.attribute")}</span>
          <span>{t("flagset.type")}</span>
          <span>{t("flagset.value")}</span>
          <span />
        </div>

        {rows.map((row) => {
          const key = row.key.trim();
          const keyErr =
            key !== "" && reservedKeys?.has(key)
              ? "flagset.enrichmentReservedKey"
              : null;
          const c = key !== "" && !keyErr ? coerce(row) : null;
          const err = c && !c.ok ? c.error : null;
          return (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_120px_1fr_36px] items-start gap-2 border-b px-2.5 py-2 last:border-b-0"
            >
              <div className="flex flex-col gap-1">
                <Input
                  className={cn(
                    "h-8 font-mono text-xs",
                    keyErr && "border-destructive",
                  )}
                  placeholder={t("flagset.attribute").toLowerCase()}
                  value={row.key}
                  disabled={readOnly}
                  onChange={(e) => patch(row.id, { key: e.target.value })}
                />
                {keyErr && (
                  <span className="text-[11px] text-destructive">
                    {t(keyErr)}
                  </span>
                )}
              </div>
              <Select
                value={row.type}
                disabled={readOnly}
                onValueChange={(v) =>
                  patch(row.id, {
                    type: v as EnrichType,
                    value: v === "boolean" ? "false" : row.value,
                  })
                }
              >
                <SelectTrigger className="h-8 font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((ty) => (
                    <SelectItem key={ty} value={ty} className="font-mono text-xs">
                      {ty}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-col gap-1">
                {row.type === "boolean" ? (
                  <div className="inline-flex w-fit rounded-md border p-0.5">
                    {(["true", "false"] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        disabled={readOnly}
                        onClick={() => patch(row.id, { value: b })}
                        className={cn(
                          "rounded px-2.5 py-1 text-xs font-medium",
                          row.value === b
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground",
                          readOnly && "cursor-not-allowed opacity-60",
                        )}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Input
                    className={cn(
                      "h-8 font-mono text-xs",
                      err && "border-destructive",
                    )}
                    placeholder={t("flagset.value").toLowerCase()}
                    value={row.value}
                    disabled={readOnly}
                    onChange={(e) => patch(row.id, { value: e.target.value })}
                  />
                )}
                {err && (
                  <span className="text-[11px] text-destructive">{t(err)}</span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={t("common.remove")}
                disabled={readOnly}
                onClick={() => removeRow(row.id)}
              >
                <Trash2Icon className="h-4 w-4" />
              </Button>
            </div>
          );
        })}

        {!readOnly && (
          <button
            type="button"
            onClick={addRow}
            className="flex w-full items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-primary hover:bg-muted"
          >
            <PlusIcon className="h-4 w-4" />
            {t("flagset.addAttribute")}
          </button>
        )}
      </div>

      {!hideChrome && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("flagset.enrichmentHint")}
        </p>
      )}
    </div>
  );
}

EnrichmentEditor.displayName = "EnrichmentEditor";
