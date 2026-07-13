import test from "node:test";
import assert from "node:assert/strict";

import {
  authStatusFromResponse,
  canRenderProtectedRoute,
  loginFormIsAvailable,
  shouldLoadProtectedSettings,
} from "../lib/auth-policy.mjs";
import { isPublicPath, loginUrlFor, safeNextPath } from "../lib/auth-routing.mjs";

test("public homepage renders without protected route gating", () => {
  assert.equal(isPublicPath("/"), true);
});

test("login route remains public when auth/me returns 401", () => {
  assert.equal(authStatusFromResponse(401, false), "unauthenticated");
  assert.equal(isPublicPath("/login"), true);
  assert.equal(loginFormIsAvailable("unauthenticated"), true);
});

test("public calls action preserves calls as next URL", () => {
  assert.equal(loginUrlFor("/calls"), "/login?next=%2Fcalls");
});

test("auth/me 401 leaves checking and becomes unauthenticated", () => {
  assert.equal(authStatusFromResponse(401, false), "unauthenticated");
});

test("login form remains available after auth/me 401 or auth network error", () => {
  assert.equal(loginFormIsAvailable("unauthenticated"), true);
  assert.equal(loginFormIsAvailable("error"), true);
});

test("protected dashboard redirects once to a safe login URL", () => {
  assert.equal(isPublicPath("/dashboard"), false);
  assert.equal(canRenderProtectedRoute("unauthenticated"), false);
  assert.equal(loginUrlFor("/dashboard"), "/login?next=%2Fdashboard");
});

test("I18n protected settings are deferred until authenticated", () => {
  assert.equal(shouldLoadProtectedSettings("checking"), false);
  assert.equal(shouldLoadProtectedSettings("unauthenticated"), false);
  assert.equal(shouldLoadProtectedSettings("error"), false);
  assert.equal(shouldLoadProtectedSettings("authenticated"), true);
});

test("only authenticated state enables protected data requests", () => {
  assert.equal(canRenderProtectedRoute("checking"), false);
  assert.equal(canRenderProtectedRoute("unauthenticated"), false);
  assert.equal(canRenderProtectedRoute("authenticated"), true);
});

test("network failures exit checking through explicit error state", () => {
  assert.equal(authStatusFromResponse(503, false), "error");
});

test("successful login enables dashboard and protected settings", () => {
  assert.equal(authStatusFromResponse(200, true), "authenticated");
  assert.equal(canRenderProtectedRoute("authenticated"), true);
  assert.equal(shouldLoadProtectedSettings("authenticated"), true);
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
