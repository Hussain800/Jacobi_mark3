"use client";

/**
 * ProbeInput — the landing's single primary CTA. A URL goes in; we route to
 * /chat?url=… where the real audit cockpit takes over. Reused in the hero and
 * the final CTA.
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeAuditUrl } from "../cockpit/trust-state";

export default function ProbeInput({
  placeholder = "paste a product, checkout, or pricing-page URL",
  cta = "Run an audit",
  showDemo = false,
}: {
  placeholder?: string;
  cta?: string;
  showDemo?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const launch = useCallback(
    (raw: string) => {
      const result = normalizeAuditUrl(raw);
      if (!result.ok) {
        setError(result.error);
        inputRef.current?.focus();
        return;
      }
      setError(null);
      router.push(`/chat?url=${encodeURIComponent(result.value)}`);
    },
    [router],
  );

  return (
    <form className="jx-probe" onSubmit={(e) => { e.preventDefault(); launch(url); }} noValidate>
      <div className="jx-probe__row">
        <span className="jx-probe__glyph" aria-hidden>›</span>
        <input
          ref={inputRef}
          className="jx-probe__input"
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); if (error) setError(null); }}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-label="Paste a URL to audit"
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? "jx-probe-error" : undefined}
        />
        <button className="jx-probe__submit" type="submit">{cta}</button>
      </div>
      {error && <p id="jx-probe-error" role="alert" className="jx-probe__note" style={{ color: "var(--over, #ff5d6b)", marginTop: 8 }}>{error}</p>}
      {showDemo && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <span className="jx-probe__note" style={{ margin: 0 }}>Or start with deterministic sample data.</span>
          <button className="jx-probe__submit" type="button" onClick={() => router.push("/chat")}>View demo result</button>
        </div>
      )}
    </form>
  );
}
