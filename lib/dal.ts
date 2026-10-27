import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
};

/**
 * Safe, serializable view of the signed-in user. Returns `null` when there is
 * no valid session. Memoized per render pass.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getCurrentSession();
  if (!session) return null;

  const { user } = session;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
});

/**
 * Use in protected pages/layouts. Redirects to /auth/login when unauthenticated.
 * Always pair with a data-layer check; never trust this alone in mutations.
 */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return user;
});