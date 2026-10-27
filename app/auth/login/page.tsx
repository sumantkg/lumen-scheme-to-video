import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "@/components/auth/AuthForm";
import AuthShell from "@/components/auth/AuthShell";
import { getCurrentUser } from "@/lib/dal";

export const metadata: Metadata = { title: "Sign in — Lumen" };

type SearchParams = Promise<{ next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next } = await searchParams;

  // Only allow same-site destinations, so `?next=` can't be used as an open
  // redirect (note the extra guard against protocol-relative "//evil.com").
  const redirectTo =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/studio";

  const user = await getCurrentUser();
  if (user) redirect(redirectTo);

  return (
    <AuthShell>
      <AuthForm mode="login" redirectTo={redirectTo} />
    </AuthShell>
  );
}
