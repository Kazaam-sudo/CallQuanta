import test from "node:test";
import assert from "node:assert/strict";

import { isPublicPath, loginUrlFor, safeNextPath } from "../lib/auth-routing.mjs";

test("unauthenticated dashboard redirects to login with next path", () => {
  assert.equal(isPublicPath("/dashboard"), false);
  assert.equal(loginUrlFor("/dashboard"), "/login?next=%2Fdashboard");
});

test("login remains a public route", () => {
  assert.equal(isPublicPath("/login"), true);
});

test("successful login preserves an intended protected next path", () => {
  assert.equal(safeNextPath("/calls/42"), "/calls/42");
});

test("unsafe or recursive next values fall back to dashboard", () => {
  assert.equal(safeNextPath("https://evil.example"), "/dashboard");
  assert.equal(safeNextPath("//evil.example"), "/dashboard");
  assert.equal(safeNextPath("/login"), "/dashboard");
});

test("settings and QA pages are protected", () => {
  assert.equal(isPublicPath("/settings"), false);
  assert.equal(isPublicPath("/settings/llm"), false);
  assert.equal(isPublicPath("/qa-reviews"), false);
});
