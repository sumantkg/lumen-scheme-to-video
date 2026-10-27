import { NextResponse } from "next/server";

import { deleteCredential } from "@/lib/credentials";
import { requireUser } from "@/lib/dal";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await context.params;

  const removed = await deleteCredential(user.id, id);
  if (!removed) {
    return NextResponse.json({ error: "Credential not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}