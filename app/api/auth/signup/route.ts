import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { RATE_LIMITS, clientIp, enforceRateLimit } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { signupSchema } from "@/lib/validation";

export async function POST(request: Request) {
  // Sign-up is the cheapest way to hammer the database.
  const limited = enforceRateLimit(`signup:${clientIp(request)}`, RATE_LIMITS.signup);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please fix the highlighted fields.",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 }
    );
  }

  const user = await prisma.user.create({
    data: { name, email, passwordHash: hashPassword(password) },
  });

  await createSession(user.id);

  return NextResponse.json(
    {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    },
    { status: 201 }
  );
}