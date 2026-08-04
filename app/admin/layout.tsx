import type { ReactNode } from "react";
import RestoredAdminFeatureBridge from "./_components/RestoredAdminFeatureBridge";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <RestoredAdminFeatureBridge />
    </>
  );
}
