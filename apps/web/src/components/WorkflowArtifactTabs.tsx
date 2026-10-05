"use client";

import Link from "next/link";
import React from "react";
import { useLanguage } from "@/components/LanguageProvider";

interface WorkflowArtifactTabsProps {
  opportunityId: string;
  active: "discovery" | "presentations";
}

export function WorkflowArtifactTabs({ opportunityId, active }: WorkflowArtifactTabsProps) {
  const { copy } = useLanguage();
  const base = `/opportunities/${encodeURIComponent(opportunityId)}`;
  const tabs = [
    { id: "discovery" as const, href: `${base}/discovery`, label: copy.workflow.discovery },
    { id: "presentations" as const, href: `${base}/presentations`, label: copy.workflow.presentation },
  ].sort((left) => left.id === active ? -1 : 1);
  return (
    <nav className="workflow-artifact-tabs" aria-label="Pitch artifacts">
      <div role="tablist" aria-label="Discovery and presentation">
        {tabs.map((tab) => (
          <Link key={tab.id} href={tab.href} role="tab" aria-selected={active === tab.id} className={active === tab.id ? "is-active" : undefined}>
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
