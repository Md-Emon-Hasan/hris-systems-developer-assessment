import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

const url = process.env.DATABASE_URL;
if (url?.startsWith("file:")) {
  const raw = decodeURIComponent(url.slice("file:".length).split("?")[0]!);
  const filePath = isAbsolute(raw) ? raw : resolve("prisma", raw);
  mkdirSync(dirname(filePath), { recursive: true });
  if (!existsSync(filePath)) closeSync(openSync(filePath, "a"));
  console.info(`SQLite database ready at ${filePath}`);
}
