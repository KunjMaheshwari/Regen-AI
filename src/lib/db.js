import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { requiredEnv } from "./env";

const globalForPrisma = globalThis;
const connectionString = requiredEnv("DATABASE_URL");
const adapter =
  globalForPrisma.prismaAdapter ||
  new PrismaPg(new Pool({ connectionString }));

const db =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
  globalForPrisma.prismaAdapter = adapter;
}

export default db;
