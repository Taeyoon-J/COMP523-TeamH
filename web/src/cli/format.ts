const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: number) => (s: string) => (useColor ? `\u001b[${code}m${s}\u001b[0m` : s);

export const bold = paint(1);
export const dim = paint(2);
export const red = paint(31);
export const green = paint(32);
export const yellow = paint(33);
export const cyan = paint(36);

const ANSI = new RegExp(String.fromCharCode(27) + "\\[\\d+m", "g");
const visibleLength = (s: string) => s.replace(ANSI, "").length;

export function table(headers: string[], rows: string[][]): string {
  if (!rows.length) return dim("  (none)");
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => visibleLength(r[i] ?? ""))));
  const line = (cells: string[]) =>
    "  " + cells.map((c, i) => c + " ".repeat(widths[i] - visibleLength(c))).join("  ").trimEnd();
  return [bold(line(headers)), dim(line(widths.map((w) => "─".repeat(w)))), ...rows.map(line)].join("\n");
}

export function heading(text: string): string {
  return "\n" + bold(cyan(text));
}
