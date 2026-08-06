"use client";
import { Suspense } from "react";
import MsNav from "@/components/MsNav";
import { PutsInner } from "@/app/puts/page";

// Cash-Secured Puts, Market Stack edition — same component, non-FMP feed.
export default function MsPutsPage() {
  return (
    <Suspense fallback={null}>
      <MsNav />
      <PutsInner apiBase="/api/ms-options" />
    </Suspense>
  );
}
