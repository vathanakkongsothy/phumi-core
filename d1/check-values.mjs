import test from "node:test";
import assert from "node:assert/strict";
import {
  decimalToUnits,
  unitsToDecimal,
  toD1Integer,
  parseEnumArray,
} from "./values.mjs";

test("money and stock quantities round-trip without floating point arithmetic", () => {
  for (const [value, scale] of [
    ["0.29", 2],
    ["-10.01", 2],
    ["123456789.99", 2],
    ["0.125", 3],
    ["-0.001", 3],
    ["0", 0],
  ]) {
    assert.equal(unitsToDecimal(decimalToUnits(value, scale), scale), value);
  }
  assert.equal(decimalToUnits("10", 2), 1000n);
  assert.equal(toD1Integer(decimalToUnits("123456789.99", 2)), 12345678999);
});
test("unsafe values and implicit rounding are rejected", () => {
  for (const bad of ["1.001", "NaN", "Infinity", "1e3", "0x10", " 10", ""])
    assert.throws(() => decimalToUnits(bad, 2));
  assert.throws(() => decimalToUnits(0.29, 2));
  assert.throws(() => decimalToUnits("90071992547409.92", 2));
  assert.throws(() => toD1Integer(9007199254740992n));
  assert.throws(() => toD1Integer(1.5));
  assert.throws(() => unitsToDecimal(0.1, 2));
});
test("array permissions reject malformed JSON, unknown roles, and scalar values", () => {
  const allowed = ["BUYER", "CREATOR", "ADMIN"];
  assert.deepEqual(parseEnumArray('["BUYER","CREATOR"]', allowed), [
    "BUYER",
    "CREATOR",
  ]);
  for (const bad of ["{BUYER}", '"ADMIN"', '["ROOT"]', "[null]", "null"])
    assert.throws(() => parseEnumArray(bad, allowed));
});
