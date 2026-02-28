import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// 1. Manually load the .env file from the root
dotenv.config({ path: ".env" });

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // 2. Use a non-null assertion or check to ensure it exists
    url: process.env.DATABASE_URL!, 
  },
});