"use client";

import { AppShell } from "@/components/AppShell";
import { AdminCreditSubNav } from "@/components/admin/AdminCreditSubNav";
import { AdminPenaltyAdjustPanel } from "@/components/admin/AdminPenaltyAdjustPanel";

export function AdminCreditAdjustPageClient() {
  return (
    <AppShell isAdmin>
      <div className="space-y-6">
        <AdminCreditSubNav active="adjust" />
        <AdminPenaltyAdjustPanel />
      </div>
    </AppShell>
  );
}
