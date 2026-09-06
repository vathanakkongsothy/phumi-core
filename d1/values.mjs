/** Parse a decimal string into exact integer minor units before a D1 write. */
export function decimalToUnits(value, scale) {
  if (typeof value !== "string")
    throw new TypeError("Pass decimal values as strings to preserve precision");
  if (!Number.isInteger(scale) || scale < 0 || scale > 12)
    throw new RangeError("Invalid decimal scale");
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match || (match[3]?.length ?? 0) > scale)
    throw new RangeError("Invalid decimal or excess fractional digits");
  const units = BigInt(
    `${match[1]}${match[2]}${(match[3] ?? "").padEnd(scale, "0")}`,
  );
  toD1Integer(units);
  return units;
}

/** Convert Prisma BigInt values to a D1-safe JavaScript binding. */
export function toD1Integer(value) {
  if (
    typeof value !== "bigint" &&
    (typeof value !== "number" || !Number.isSafeInteger(value))
  )
    throw new TypeError("Expected an exact integer");
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new RangeError("Value exceeds D1 safe integer range");
  return number;
}

/** Serialize minor units back to a fixed-scale decimal string for API output. */
export function unitsToDecimal(value, scale) {
  if (!Number.isInteger(scale) || scale < 0 || scale > 12)
    throw new RangeError("Invalid decimal scale");
  toD1Integer(value);
  const units = BigInt(value);
  const sign = units < 0n ? "-" : "";
  const digits = (units < 0n ? -units : units)
    .toString()
    .padStart(scale + 1, "0");
  return scale === 0
    ? sign + digits
    : `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

/** Validate a JSON array before application code treats it as permissions. */
export function parseEnumArray(value, allowed) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== "string" || !allowed.includes(item))
  )
    throw new TypeError("Invalid enum array");
  return [...parsed];
}
