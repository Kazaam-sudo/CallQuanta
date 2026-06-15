export function PilotBanner() {
  const text = process.env.APP_BANNER_TEXT || "";
  const variant = process.env.APP_BANNER_VARIANT === "warning" ? "warning" : "info";

  if (!text) return null;

  return (
    <div className={`pilot-banner pilot-banner-${variant}`} role="status">
      {text}
    </div>
  );
}
