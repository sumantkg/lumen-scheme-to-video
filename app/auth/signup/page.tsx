import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "@/components/auth/AuthForm";
import AuthShell from "@/components/auth/AuthShell";
import { getCurrentUser } from "@/lib/dal";

export const metadata: Metadata = { title: "Create your account — Lumen" };

type SearchParams = Promise<{
  email?: string;
  prompt?: string;
}>;

export default async function SignupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { email, prompt } = await searchParams;

  // A prompt from the landing hero opens the studio pre-filled.
  const next = prompt
    ? `/studio?prompt=${encodeURIComponent(prompt)}`
    : "/studio";

  const user = await getCurrentUser();
  if (user) redirect(next);

  return (
    <AuthShell>
      {prompt && (
        <p className="auth-note">
          Start with: <strong>{prompt}</strong>
        </p>
      )}
      <AuthForm mode="signup" initialEmail={email ?? ""} redirectTo={next} />
    </AuthShell>
  );
}