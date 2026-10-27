"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/dal";
import { resetDemoProject } from "@/lib/demo";

export async function resetDemoAction() {
  const user = await requireUser();
  await resetDemoProject(user.id);
  redirect("/demo");
}
