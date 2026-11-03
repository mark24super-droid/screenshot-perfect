import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

for (const suffix of ["", "-wal", "-shm"]) {
  const file = `${config.dbPath}${suffix}`;
  if (fs.existsSync(file)) fs.rmSync(file);
}
console.log(`Removed database files at ${path.dirname(config.dbPath)}. Restart the server to recreate and seed.`);
