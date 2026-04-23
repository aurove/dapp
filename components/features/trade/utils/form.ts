export function asTrimmedString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim();
  return "";
}

export function isValidDecimalInput(value: string, maxDecimals: number): boolean {
  if (!/^\d+(\.\d+)?$/.test(value)) return false;
  const fraction = value.split(".")[1] ?? "";
  return fraction.length <= maxDecimals;
}

export function normalizeInputAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value.toFixed(6).replace(/\.?0+$/, "");
}
