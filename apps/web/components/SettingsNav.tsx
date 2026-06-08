"use client";

import Link from "next/link";
import { useI18n } from "./I18nProvider";

const settingsLinks = [
  { href: "/settings/llm", key: "settings.llmProviders" },
  { href: "/settings/stt", key: "settings.sttProviders" },
  { href: "/settings/scorecard", key: "settings.scorecard" },
  { href: "/settings/workspace", key: "settings.workspaceLanguage" },
  { href: "/settings/integrations", key: "settings.telephonyIntegrations" },
  { href: "/settings/users", key: "settings.usersAccess" },
  { href: "/settings/system-status", key: "settings.systemStatus" },
  { href: "/settings/retention", key: "settings.retention" },
  { href: "/settings/audit-log", key: "settings.auditLog" },
];

export function SettingsNav() {
  const { t } = useI18n();
  return (
    <nav className="actions settings-nav" aria-label="Settings navigation">
      {settingsLinks.map((link) => <Link key={link.href} href={link.href}>{t(link.key)}</Link>)}
    </nav>
  );
}
