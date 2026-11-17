import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { resolveServerDialect, setSqlDialect } from "./db/dialect";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(apiRoot, ".env") });

// Schema modules read the dialect when they are first imported. Set it before
// the server graph (and therefore the table factory) loads.
setSqlDialect(resolveServerDialect(process.env.SQL_DIALECT));

const { listen } = await import("./serve");
await listen();
