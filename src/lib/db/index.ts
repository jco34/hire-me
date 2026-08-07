import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * Local-first Postgres. The connection string is the only thing that changes when this
 * moves to a hosted database, which is the whole point of using real Postgres locally
 * rather than an embedded store.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill in your local Postgres credentials.",
  );
}

// Next dev reloads modules on every edit. Without this the pool count climbs until
// Postgres refuses new connections.
const globalForDb = globalThis as unknown as { __hireMePool?: Pool };

const pool =
  globalForDb.__hireMePool ??
  new Pool({
    connectionString,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__hireMePool = pool;
}

export const db = drizzle(pool, { schema });
export { schema };
