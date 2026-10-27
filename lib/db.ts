import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Single Prisma Client instance for the whole process.
 *
 * Deliberately does NOT `import "server-only"`: the background worker runs in
 * plain Node (not a React Server Component), and that package throws outside
 * of a react-server environment.
 *
 * Prisma 7 is engine-less for SQL: it talks to the database through a driver
 * adapter. Dev/prod-local use SQLite via better-sqlite3. To move to Postgres,
 * swap this adapter for `@prisma/adapter-pg` and change the datasource provider.
 *
 * The instance is cached on `globalThis` in development so Fast Refresh does
 * not open a new connection pool on every reload.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and try again."
    );
  }

  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
