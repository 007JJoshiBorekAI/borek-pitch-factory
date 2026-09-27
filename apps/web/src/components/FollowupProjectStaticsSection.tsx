"use client";

import { useCallback, useEffect, useState } from "react";

import { getOpportunity, updateOpportunity } from "@/lib/api";
import {
  emptyFollowupProjectStatics,
  primaryFollowupRecipient,
  validateFollowupProjectStatics,
  type FollowupProjectStatics,
  type FollowupRecipient,
} from "@/lib/followupReview";

type FollowupProjectStaticsSectionProps = {
  accessToken: string | null;
  opportunityId: string;
  onReadyChange?: (ready: boolean) => void;
  disabled?: boolean;
};

export function FollowupProjectStaticsSection({
  accessToken,
  opportunityId,
  onReadyChange,
  disabled = false,
}: FollowupProjectStaticsSectionProps) {
  const [statics, setStatics] = useState<FollowupProjectStatics>(emptyFollowupProjectStatics);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notifyReady = useCallback(
    (ready: boolean) => {
      onReadyChange?.(ready);
    },
    [onReadyChange],
  );

  useEffect(() => {
    let active = true;
    async function load() {
      if (!accessToken || !opportunityId) {
        setLoading(false);
        notifyReady(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const opportunity = await getOpportunity(accessToken, opportunityId);
        if (!active) return;
        if (opportunity.followup_statics) {
          setStatics(opportunity.followup_statics);
          const valid = validateFollowupProjectStatics(opportunity.followup_statics).length === 0;
          setSaved(valid);
          notifyReady(valid);
        } else {
          setStatics(emptyFollowupProjectStatics());
          setSaved(false);
          notifyReady(false);
        }
      } catch {
        if (active) {
          setError("Project email settings could not be loaded.");
          notifyReady(false);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [accessToken, opportunityId, notifyReady]);

  const primary = primaryFollowupRecipient(statics);
  const primaryIndex = statics.standard_recipients.findIndex(
    (recipient) => recipient.kind === "to" && recipient.primary,
  );

  function handleStaticsChange(value: FollowupProjectStatics) {
    setStatics(value);
    setSaved(false);
    notifyReady(false);
    setError(null);
  }

  function updatePrimary(updates: Partial<FollowupRecipient>) {
    handleStaticsChange({
      ...statics,
      standard_recipients: statics.standard_recipients.map((recipient, index) =>
        index === primaryIndex
          ? { ...recipient, ...updates, kind: "to", primary: true }
          : recipient,
      ),
    });
  }

  function updateRecipient(index: number, updates: Partial<FollowupRecipient>) {
    handleStaticsChange({
      ...statics,
      standard_recipients: statics.standard_recipients.map((recipient, recipientIndex) =>
        recipientIndex === index ? { ...recipient, ...updates, primary: false } : recipient,
      ),
    });
  }

  function removeRecipient(index: number) {
    handleStaticsChange({
      ...statics,
      standard_recipients: statics.standard_recipients.filter((_, recipientIndex) => recipientIndex !== index),
    });
  }

  async function handleSave() {
    if (!accessToken || !opportunityId) return;
    const validation = validateFollowupProjectStatics(statics);
    if (validation.length) {
      setError(validation[0]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await updateOpportunity(accessToken, opportunityId, { followup_statics: statics });
      if (!updated.followup_statics) {
        throw new Error("Missing saved project statics");
      }
      setStatics(updated.followup_statics);
      setSaved(true);
      notifyReady(true);
    } catch {
      setError("Project email settings could not be saved. Check the values and try again.");
      notifyReady(false);
    } finally {
      setBusy(false);
    }
  }

  const locked = disabled || busy;

  return (
    <section className="pitch-followup-statics" style={{ marginTop: "1.75rem" }}>
      <div className="pitch-panel-label">MS-32 email settings</div>
      <h4 className="pitch-mid-title" style={{ fontSize: "1.15rem", marginBottom: "0.35rem" }}>
        Project email settings
      </h4>
      <p className="pitch-subtle" style={{ marginTop: 0 }}>
        Enter the project name, intended recipients, and sender for this opportunity before generating an MS-32 email
        draft. The model never invents these values.
      </p>
      <p className="pitch-footnote" style={{ marginTop: "0.5rem" }}>
        Status:{" "}
        <strong style={{ color: saved ? "var(--pitch-blue)" : "inherit" }}>
          {saved ? "Saved on opportunity" : "Not saved yet"}
        </strong>
      </p>
      {error ? (
        <div className="alert alert-error" role="alert" style={{ marginTop: "0.75rem" }}>
          {error}
        </div>
      ) : null}
      {loading ? <p className="pitch-subtle">Loading project settings…</p> : null}
      {!loading ? (
        <>
          <div className="pitch-card-row">
            <label className="pitch-info-card">
              <span>Project name</span>
              <input
                value={statics.project_name}
                onChange={(event) => handleStaticsChange({ ...statics, project_name: event.target.value })}
                disabled={locked}
              />
            </label>
            <label className="pitch-info-card">
              <span>Client short name</span>
              <input
                value={statics.client_short}
                onChange={(event) => handleStaticsChange({ ...statics, client_short: event.target.value })}
                disabled={locked}
              />
            </label>
          </div>
          <label className="pitch-info-card">
            <span>Client tone</span>
            <select
              value={statics.salutation_style}
              onChange={(event) =>
                handleStaticsChange({
                  ...statics,
                  salutation_style: event.target.value as FollowupProjectStatics["salutation_style"],
                })
              }
              disabled={locked}
            >
              <option value="informal">Du / informal</option>
              <option value="formal">Sie / formal</option>
            </select>
          </label>
          <div className="pitch-panel-label">Primary recipient</div>
          <div className="pitch-card-row">
            <label className="pitch-info-card">
              <span>Email</span>
              <input
                type="email"
                value={primary.email}
                onChange={(event) => updatePrimary({ email: event.target.value })}
                disabled={locked}
              />
            </label>
            <label className="pitch-info-card">
              <span>First name</span>
              <input
                value={primary.first_name ?? ""}
                onChange={(event) => updatePrimary({ first_name: event.target.value || null })}
                disabled={locked}
              />
            </label>
          </div>
          <div className="pitch-card-row">
            <label className="pitch-info-card">
              <span>Formal salutation</span>
              <input
                value={primary.salutation ?? ""}
                placeholder="Mr, Ms, Dr"
                onChange={(event) => updatePrimary({ salutation: event.target.value || null })}
                disabled={locked}
              />
            </label>
            <label className="pitch-info-card">
              <span>Last name</span>
              <input
                value={primary.last_name ?? ""}
                onChange={(event) => updatePrimary({ last_name: event.target.value || null })}
                disabled={locked}
              />
            </label>
          </div>
          <div className="pitch-panel-label">Sender</div>
          <div className="pitch-card-row">
            <label className="pitch-info-card">
              <span>Name</span>
              <input
                value={statics.sender_profile.name}
                onChange={(event) =>
                  handleStaticsChange({
                    ...statics,
                    sender_profile: { ...statics.sender_profile, name: event.target.value },
                  })
                }
                disabled={locked}
              />
            </label>
            <label className="pitch-info-card">
              <span>Role</span>
              <input
                value={statics.sender_profile.role}
                onChange={(event) =>
                  handleStaticsChange({
                    ...statics,
                    sender_profile: { ...statics.sender_profile, role: event.target.value },
                  })
                }
                disabled={locked}
              />
            </label>
          </div>
          <label className="pitch-info-card">
            <span>Sender email</span>
            <input
              type="email"
              value={statics.sender_profile.email}
              onChange={(event) =>
                handleStaticsChange({
                  ...statics,
                  sender_profile: { ...statics.sender_profile, email: event.target.value },
                })
              }
              disabled={locked}
            />
          </label>
          {statics.standard_recipients.length > 1 || statics.standard_recipients.some((_, index) => index !== primaryIndex) ? (
            <>
              <div className="pitch-panel-label">Additional recipients</div>
              {statics.standard_recipients.map((recipient, index) =>
                index === primaryIndex ? null : (
                  <div key={`recipient-${index}`} className="pitch-card-row" style={{ alignItems: "flex-end" }}>
                    <label className="pitch-info-card">
                      <span>Email</span>
                      <input
                        type="email"
                        value={recipient.email}
                        onChange={(event) => updateRecipient(index, { email: event.target.value })}
                        disabled={locked}
                      />
                    </label>
                    <label className="pitch-info-card">
                      <span>Type</span>
                      <select
                        value={recipient.kind}
                        onChange={(event) =>
                          updateRecipient(index, { kind: event.target.value as FollowupRecipient["kind"] })
                        }
                        disabled={locked}
                      >
                        <option value="to">To</option>
                        <option value="cc">CC</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => removeRecipient(index)}
                      disabled={locked}
                    >
                      Remove
                    </button>
                  </div>
                ),
              )}
            </>
          ) : null}
          <div className="pitch-split-actions" style={{ marginTop: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={locked || statics.standard_recipients.length >= 20}
              onClick={() =>
                handleStaticsChange({
                  ...statics,
                  standard_recipients: [
                    ...statics.standard_recipients,
                    {
                      email: "",
                      first_name: null,
                      last_name: null,
                      salutation: null,
                      kind: "cc",
                      primary: false,
                    },
                  ],
                })
              }
            >
              Add recipient
            </button>
            <button type="button" className="btn btn-primary" disabled={locked} onClick={() => void handleSave()}>
              {busy ? "Saving…" : "Save project settings"}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
