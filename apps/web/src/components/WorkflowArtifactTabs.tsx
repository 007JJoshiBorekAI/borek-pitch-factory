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
  ];
  function handleKeyDown(event: React.KeyboardEvent<HTMLAnchorElement>, index: number) {
    let target = index;
    if (event.key === "ArrowRight") target = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") target = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = tabs.length - 1;
    else return;
    event.preventDefault();
    const links = event.currentTarget.parentElement?.querySelectorAll<HTMLAnchorElement>('[role="tab"]');
    links?.[target]?.focus();
    links?.[target]?.click();
  }
  return (
    <nav className="workflow-artifact-tabs" aria-label="Pitch artifacts">
      <div role="tablist" aria-label="Discovery and presentation">
        {tabs.map((tab, index) => (
          <Link key={tab.id} id={`artifact-tab-${tab.id}`} href={tab.href} role="tab" aria-controls={`artifact-panel-${tab.id}`} aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1} className={active === tab.id ? "is-active" : undefined} onKeyDown={(event) => handleKeyDown(event, index)}>
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
