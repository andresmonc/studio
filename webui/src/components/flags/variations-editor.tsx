// VariationsEditor renders the editable variation list (names + typed values +
// add/remove). The flag type lives outside this component; changing type resets
// variations, so callers wire a type selector + onTypeChange separately.
// Extracted from flag-form.tsx.

import type { Dispatch, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlagType } from "@/types/api";
import { nextId, valueError } from "./flag-form-helpers";
import type { Tr, Variation } from "./flag-form-types";

export function VariationsEditor({
  t,
  type,
  variations,
  setVariations,
}: {
  t: Tr;
  type: FlagType;
  variations: Variation[];
  setVariations: Dispatch<SetStateAction<Variation[]>>;
}) {
  const patch = (id: number, p: Partial<Variation>) =>
    setVariations((vs) => vs.map((v) => (v.id === id ? { ...v, ...p } : v)));
  const add = () =>
    setVariations((vs) => [
      ...vs,
      { id: nextId(), name: `treatment-${vs.length}`, value: "" },
    ]);
  const remove = (id: number) =>
    setVariations((vs) => (vs.length > 2 ? vs.filter((v) => v.id !== id) : vs));
  const nameCounts = variations.reduce<Record<string, number>>((m, v) => {
    m[v.name] = (m[v.name] ?? 0) + 1;
    return m;
  }, {});
  // Boolean flags are fixed: the two variations (enabled/disabled) and their
  // true/false values are locked, so name and value are read-only and the
  // add/remove affordances are suppressed.
  const isBoolean = type === "boolean";

  return (
    <div className="flex flex-col gap-2">
      {variations.map((v) => {
        const nameErr = isBoolean
          ? null
          : v.name.trim() === ""
            ? "flag.wizard.errNameRequired"
            : nameCounts[v.name] > 1
              ? "flag.wizard.errNameDup"
              : null;
        const valErr = isBoolean ? null : valueError(type, v.value);
        return (
          <div
            key={v.id}
            className="grid grid-cols-[1fr_1fr_32px] items-start gap-2"
          >
            <div className="flex flex-col gap-1">
              <Input
                className={cn(
                  "h-8 font-mono text-xs",
                  nameErr && "border-destructive",
                )}
                value={v.name}
                onChange={(e) => patch(v.id, { name: e.target.value })}
                placeholder="name"
                disabled={isBoolean}
              />
              {nameErr && (
                <span className="text-[11px] text-destructive">{t(nameErr)}</span>
              )}
            </div>
            {isBoolean ? (
              <Input
                className="h-8 font-mono text-xs"
                value={v.value}
                disabled
              />
            ) : (
              <div className="flex flex-col gap-1">
                <Input
                  className={cn(
                    "h-8 font-mono text-xs",
                    valErr && "border-destructive",
                  )}
                  value={v.value}
                  onChange={(e) => patch(v.id, { value: e.target.value })}
                  placeholder={t("flag.wizard.value")}
                />
                {valErr && (
                  <span className="text-[11px] text-destructive">
                    {t(valErr)}
                  </span>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isBoolean || variations.length <= 2}
              onClick={() => remove(v.id)}
              aria-label={t("common.remove")}
            >
              <Trash2Icon className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
      {!isBoolean && (
        <Button variant="ghost" size="sm" className="w-fit" onClick={add}>
          <PlusIcon className="h-4 w-4" />
          {t("flag.wizard.addVariation")}
        </Button>
      )}
    </div>
  );
}
