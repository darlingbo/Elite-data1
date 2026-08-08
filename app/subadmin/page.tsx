import { redirect } from "next/navigation";

export default function LegacySubAdminPage() {
  redirect("/agent/dashboard");
}
