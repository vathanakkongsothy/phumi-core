import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const dir = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(await readFile(join(dir, "contract.json"), "utf8"));
const db = new DatabaseSync(":memory:");
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
try {
  db.exec("PRAGMA foreign_keys=ON;");
  const names = (await readdir(join(dir, "migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of names) {
    db.exec("BEGIN;");
    db.exec(await readFile(join(dir, "migrations", name), "utf8"));
    db.exec("COMMIT;");
  }
  const missing = [];
  for (const table of contract.tables) {
    const columns = db.prepare(`PRAGMA table_info(${quote(table.name)})`).all();
    for (const column of table.columns) {
      const found = columns.find((c) => c.name === column.name);
      if (found && column.type === "DateTime" && found.dflt_value) {
        const row = db
          .prepare("SELECT " + found.dflt_value + " AS value")
          .get();
        if (
          row.value !== new Date(row.value).toISOString().replace("Z", "+00:00")
        )
          throw new Error("Date default must use canonical UTC ISO format");
      }
      if (!found) missing.push(`${table.name}.${column.name}`);
      if (
        found &&
        column.type === "BigInt" &&
        found.type !== "INTEGER" &&
        found.type !== "BIGINT"
      )
        throw new Error(
          `Scaled integer has incorrect affinity: ${table.name}.${column.name}`,
        );
    }
  }
  if (missing.length)
    throw new Error(
      `D1 migrations are missing application fields: ${missing.join(", ")}`,
    );
  if (db.prepare("PRAGMA foreign_key_check").all().length)
    throw new Error("Foreign key validation failed");
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw new Error("Integrity validation failed");
  console.log(
    `D1 migrations match ${contract.tables.length} application models; integrity and foreign keys OK`,
  );
} finally {
  db.close();
}
