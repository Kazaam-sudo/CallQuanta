import assert from "node:assert/strict";
import test from "node:test";

import { canPersistWorkspaceSettings } from "../lib/workspace-settings-policy.mjs";

test("only admins persist shared workspace settings", () => {
  assert.equal(canPersistWorkspaceSettings({ role: "admin" }), true);
  for (const role of ["manager", "supervisor", "agent", "viewer"]) {
    assert.equal(canPersistWorkspaceSettings({ role }), false);
  }
  assert.equal(canPersistWorkspaceSettings(null), false);
});
