import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	out: "./drizzle-pg",
	schema: "./src/db/schema.pg.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "postgres://app:app@127.0.0.1:5432/app",
	},
});
