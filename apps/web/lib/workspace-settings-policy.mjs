export function canPersistWorkspaceSettings(user) {
  return user?.role === "admin";
}
