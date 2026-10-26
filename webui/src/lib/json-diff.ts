// Line-level diff of two JSON snapshots, used by the audit log to render a
// before/after change view. We pretty-print each side and run an LCS diff over
// the lines: lines only in `before` are deletions, only in `after` are
// additions, and shared lines are context. One-sided inputs (create has only
// `after`, delete only `before`) degrade to all-add / all-del.

export type DiffKind = "ctx" | "add" | "del";
export interface DiffLine {
  kind: DiffKind;
  text: string;
}

function toLines(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  try {
    const json = JSON.stringify(value, null, 2);
    if (json === undefined) return [String(value)];
    return json.split("\n");
  } catch {
    return [String(value)];
  }
}

// Above this combined line count we skip the O(n*m) LCS matrix (which would
// allocate hundreds of MB and freeze the main thread) and degrade to a plain
// all-removed / all-added rendering of both snapshots.
const MAX_DIFF_LINES = 2000;

export function jsonDiff(before: unknown, after: unknown): DiffLine[] {
  const a = toLines(before);
  const b = toLines(after);
  const n = a.length;
  const m = b.length;

  if (n + m > MAX_DIFF_LINES) {
    return [
      ...a.map((text): DiffLine => ({ kind: "del", text })),
      ...b.map((text): DiffLine => ({ kind: "add", text })),
    ];
  }

  // Classic longest-common-subsequence table over the two line arrays.
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "ctx", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "del", text: a[i] });
      i++;
    } else {
      out.push({ kind: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ kind: "del", text: a[i++] });
  while (j < m) out.push({ kind: "add", text: b[j++] });
  return out;
}
