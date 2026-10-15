import { Suspense } from "react";
import { StudioResult } from "@/components/studio/studio-result";
export default function DesignPage() {
  return (
    <Suspense
      fallback={<div className="viewer-loading">Opening your saved build…</div>}
    >
      <StudioResult />
    </Suspense>
  );
}
