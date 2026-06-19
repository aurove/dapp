import "server-only";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toHex(value: Uint8Array): string {
  return `0x${Buffer.from(value).toString("hex")}`;
}

export function toJsonSafeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Uint8Array) {
    return toHex(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toJsonSafeValue(entry));
  }

  if (isPlainObject(value)) {
    return Object.keys(value).reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = toJsonSafeValue(value[key]);
      return accumulator;
    }, {});
  }

  return String(value);
}
