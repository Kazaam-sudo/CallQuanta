import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  authStatusFromResponse,
  canRenderProtectedRoute,
  loginFormIsAvailable,
  shouldLoadProtectedSettings,
  shouldRedirectLogin,
} from "../lib/auth-policy.mjs";
import { isPublicPath, loginUrlFor, safeNextPath } from "../lib/auth-routing.mjs";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testsDir, "..");
const repoRoot = path.resolve(webRoot, "../..");

test("no cookie: login remains visible after auth/me 401", () => {
  const status = authStatusFromResponse(401, false);
  assert.equal(status, "unauthenticated");
  assert.equal(isPublicPath("/login"), true);
  assert.equal(loginFormIsAvailable(status), true);
  assert.equal(shouldRedirectLogin(status, false), false);
});

test("valid API-accepted cookie redirects login to dashboard", () => {
  const status = authStatusFromResponse(200, true);
  assert.equal(status, "authenticated");
  assert.equal(shouldRedirectLogin(status, true), true);
});

test("stale cookie signed with an old secret remains on login", () => {
  const status = authStatusFromResponse(401, false);
  assert.equal(loginFormIsAvailable(status), true);
  assert.equal(shouldRedirectLogin(status, false), false);
});

test("malformed cookie remains on login", () => {
  const status = authStatusFromResponse(401, false);
  assert.equal(loginFormIsAvailable(status), true);
  assert.equal(shouldRedirectLogin(status, false), false);
});

test("valid-looking cookie rejected by auth/me never redirects to dashboard", () => {
  assert.equal(shouldRedirectLogin(authStatusFromResponse(401, false), false), false);
});

test("dashboard without a valid API session redirects once to login", () => {
  assert.equal(isPublicPath("/dashboard"), false);
  assert.equal(canRenderProtectedRoute("unauthenticated"), false);
  assert.equal(loginUrlFor("/dashboard"), "/login?next=%2Fdashboard");
});

test("Next middleware no longer performs cookie-presence authentication", () => {
  assert.equal(existsSync(path.join(webRoot, "middleware.ts")), false);
});

test("logout clears the same API cookie name and path used by login", () => {
  const source = readFileSync(path.join(repoRoot, "apps/api/app/main.py"), "utf8");
  assert.match(source, /response\.set_cookie\(\s*SESSION_COOKIE_NAME,/s);
  assert.match(source, /response\.delete_cookie\(SESSION_COOKIE_NAME, path="\/"\)/);
  assert.match(source, /samesite="lax"/);
  assert.match(source, /httponly=True/);
});

test("login refresh dashboard flow depends on auth/me 200 with a user", () => {
  const status = authStatusFromResponse(200, true);
  assert.equal(canRenderProtectedRoute(status), true);
  assert.equal(shouldLoadProtectedSettings(status), true);
});

test("public homepage renders without protected route gating", () => {
  assert.equal(isPublicPath("/"), true);
});

test("public calls action preserves calls as next URL", () => {
  assert.equal(loginUrlFor("/calls"), "/login?next=%2Fcalls");
});

test("network failures exit checking through explicit error state", () => {
  assert.equal(authStatusFromResponse(503, false), "error");
  assert.equal(loginFormIsAvailable("error"), true);
});

test("successful response without a user is unauthenticated", () => {
  assert.equal(authStatusFromResponse(200, false), "unauthenticated");
});

test("unsafe or recursive next values fall back to dashboard", () => {
  assert.equal(safeNextPath("https://evil.example"), "/dashboard");
  assert.equal(safeNextPath("//evil.example"), "/dashboard");
  assert.equal(safeNextPath("/login"), "/dashboard");
});

test("settings, calls and QA routes are protected", () => {
  assert.equal(isPublicPath("/calls"), false);
  assert.equal(isPublicPath("/calls/42"), false);
  assert.equal(isPublicPath("/settings"), false);
  assert.equal(isPublicPath("/settings/llm"), false);
  assert.equal(isPublicPath("/qa-reviews"), false);
});
