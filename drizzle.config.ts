import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next reads .env.local automatically; drizzle-kit runs outside Next and does not.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
