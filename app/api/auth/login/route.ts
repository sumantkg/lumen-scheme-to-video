import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { RATE_LIMITS, clientIp, enforceRateLimit } from "@/lib/http";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  // Bound brute-force attempts before doing any work: per address first, then
  // per account once the submitted email is known.
  const addressLimited = enforceRateLimit(
    `login:ip:${clientIp(request)}`,
    RATE_LIMITS.login
  );
  if (addressLimited) return addressLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please fix the highlighted fields.",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  const { email, password } = parsed.data;

  const accountLimited = enforceRateLimit(
    `login:account:${email}`,
    RATE_LIMITS.loginAccount
  );
  if (accountLimited) return accountLimited;

  const user = await prisma.user.findUnique({ where: { email } });

  // Same generic message whether the email is unknown or the password is
  // wrong, so we don't reveal which accounts exist.
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { error: "Incorrect email or password." },
      { status: 401 }
    );
  }

  await createSession(user.id);

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
}
