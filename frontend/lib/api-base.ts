export function getClientApiBase() {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "");

  if (!configured) return "";

  try {
    const url = new URL(configured);
    const isLocalBackend =
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
      url.port === "8000";

    return isLocalBackend ? "" : configured;
  } catch {
    return "";
  }
}
