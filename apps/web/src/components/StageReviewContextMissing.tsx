"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppPageHeader } from "@/components/AppPageHeader";
import { SiteHeader } from "@/components/SiteHeader";
import { loadActiveOpportunity, pipelineHref } from "@/lib/pipelineContext";

interface StageReviewContextMissingProps {
  title: string;
  detail: string;
}

/** Shown when a stage review route is opened without ?opportunityId=. */
export function StageReviewContextMissing({ title, detail }: StageReviewContextMissingProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    const stored = loadActiveOpportunity();
    if (stored?.id) {
      router.replace(pipelineHref(pathname, stored.id));
      return;
    }
    setRestoring(false);
  }, [pathname, router]);

  return (
    <div className="app-workspace">
      <SiteHeader />
      <div className="app-shell app-workspace-body">
        <AppPageHeader kicker="Stage output review" title={title} lead={detail} />
        <div className="upload-panel pipeline-empty-panel">
          <div className="pipeline-empty-body">
            {restoring ? (
              <p className="upload-hint">Restoring your opportunity…</p>
            ) : (
              <>
                <p className="upload-hint">
                  Open this review from an opportunity after intake is saved on the upload page.
                </p>
                <Link href="/upload" className="btn btn-primary">
                  Go to upload
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
