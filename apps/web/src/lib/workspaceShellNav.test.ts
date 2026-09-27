import assert from "node:assert/strict";

import {
  emailFromAccessToken,
  resolveActiveNavSection,
  resolveWorkspaceNavHref,
  resolveWorkspacePageTitle,
  resolveUserInitials,
} from "./workspaceShellNav.js";
import { postMeetingIntakeHref } from "./journeyStageSelection.js";

assert.equal(resolveActiveNavSection("/upload"), "pre-meeting");
assert.equal(resolveActiveNavSection("/framework-review"), "pre-meeting");
assert.equal(resolveActiveNavSection("/deepening/review"), "post-meeting");
assert.equal(resolveActiveNavSection("/followup-review"), "post-meeting");
assert.equal(resolveActiveNavSection("/clients"), "clients");
assert.equal(resolveActiveNavSection("/archive"), null);
assert.equal(resolveActiveNavSection("/activity"), null);
assert.equal(resolveActiveNavSection("/"), null);

assert.equal(resolveWorkspacePageTitle("/upload"), "Add New Client");
assert.equal(resolveWorkspacePageTitle("/framework-review"), "Pitch generation");
assert.equal(resolveWorkspacePageTitle("/followup-review"), "Follow-up email");
assert.equal(resolveWorkspacePageTitle("/clients"), "Clients");

assert.equal(
  postMeetingIntakeHref("opp-123"),
  "/upload?opportunityId=opp-123&journeyStage=deepening",
);
assert.equal(postMeetingIntakeHref(null), "/clients");
assert.equal(postMeetingIntakeHref(""), "/clients");
assert.equal(
  resolveWorkspaceNavHref("post-meeting", "opp-456"),
  "/upload?opportunityId=opp-456&journeyStage=deepening",
);
assert.equal(resolveWorkspaceNavHref("post-meeting", null), "/clients");
assert.equal(resolveWorkspaceNavHref("pre-meeting", "opp-456"), "/upload");
assert.equal(resolveWorkspaceNavHref("clients", "opp-456"), "/clients");

assert.equal(resolveUserInitials("Elena Manovska", null), "EM");
assert.equal(resolveUserInitials(null, "elena@boreksolutions.de"), "EL");
assert.equal(
  emailFromAccessToken(
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJlbWFpbCI6InVzZXItYUBleGFtcGxlLmNvbSIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJpYXQiOjE3OTAzMzQyMjQsImV4cCI6MTc5MDM0MTQyNH0.4nDKjP0wUCPx3PEGfIoCTqt2SEQPmHVX4hVMUSPhMxU",
  ),
  "user-a@example.com",
);

console.log("FIGMA-02 workspace shell nav tests passed");
