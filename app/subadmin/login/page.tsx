import { redirect } from "next/navigation";

export default function LegacySubAdminLoginPage() {
  redirect("/agent/dashboard");
}
