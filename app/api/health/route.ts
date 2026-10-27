import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

/**
 * GET /api/health — liveness plus a database probe, for orchestrators and
 * uptime checks.
 *
 * Public on purpose, and deliberately free of any configuration detail: no
 * keys, no URLs, no counts.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("[health] database probe failed:", error);
    return NextResponse.json(
      { status: "degraded", db: "error" },
      { status: 503 }
    );
  }

  return NextResponse.json({
    status: "ok",
    db: "ok",
    latencyMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
  });
}
