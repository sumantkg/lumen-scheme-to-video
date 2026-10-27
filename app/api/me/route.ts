import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";

/**
 * Session probe. Returns `200 { user: null }` when signed out rather than a
 * 401 so the landing page's client-side check doesn't log a console error on
 * every visit.
 */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user: user ?? null });
}
