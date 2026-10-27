import type { Metadata } from "next";

import ApiKeys from "@/components/settings/ApiKeys";
import { requireUser } from "@/lib/dal";

export const metadata: Metadata = { title: "API keys — Lumen" };

export default async function SettingsPage() {
  await requireUser();
  return <ApiKeys />;
}