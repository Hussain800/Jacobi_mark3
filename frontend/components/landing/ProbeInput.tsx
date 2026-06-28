"use client";

/**
 * ProbeInput — the landing's single primary CTA. A URL goes in; we route to
 * /chat?url=… where the real audit cockpit takes over. Reused in the hero and
 * the final CTA.
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function ProbeInput({
  placeholder = "paste a product, checkout, or pricing-page URL",
  cta = "Run an audit",
}: {
  placeholder?: string;
  cta?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");

  const launch = useCallback(
    (raw: string) => {
      let v = raw.trim();
      if (!v) { inputRef.current?.focus(); return; }
      if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
      router.push(`/chat?url=${encodeURIComponent(v)}`);
    },
    [router],
  );

  return (
    <form className="jx-probe" onSubmit={(e) => { e.preventDefault(); launch(url); }}>
      <div className="jx-probe__row">
        <span className="jx-probe__glyph" aria-hidden>›</span>
        <input
          ref={inputRef}
          className="jx-probe__input"
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-label="Paste a URL to audit"
        />
        <button className="jx-probe__submit" type="submit">{cta}</button>
      </div>
    </form>
  );
}
