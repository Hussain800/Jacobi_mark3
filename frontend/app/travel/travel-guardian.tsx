"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Provider = {
  provider_id?: string;
  display_name?: string;
  configured?: boolean;
  health?: string;
  data_label?: string;
  official?: boolean;
  verticals?: string[];
};

const API = "/api/v2/travel";
const ONBOARDING_KEY = "jacobi.travel.extension-onboarding.v1";

function environmentCopy(environment?: string) {
  if (environment === "fixture") return "Sanitized demo/test data. Not live inventory.";
  if (environment === "sandbox_api") return "Official test inventory; limited or synthetic, not live availability.";
  if (environment === "live_official_api") return "Official live API inventory; coverage is still not exhaustive.";
  return "Provider environment was not reported.";
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : typeof body?.error === "string" ? body.error : `Request failed (${response.status})`;
    throw new Error(detail);
  }
  return body as T;
}

function StatusDot({ state }: { state: "ready" | "waiting" | "unavailable" }) {
  return <span className={`tg-status-dot is-${state === "ready" ? "completed" : state === "waiting" ? "processing" : "degraded"}`} aria-hidden />;
}

export default function TravelGuardian() {
  const [onboardingSeen, setOnboardingSeen] = useState(false);
  const [browserLabel, setBrowserLabel] = useState("Checking browser");
  const [browserReady, setBrowserReady] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerRuntime, setProviderRuntime] = useState("checking");
  const [providerError, setProviderError] = useState("");

  useEffect(() => {
    setOnboardingSeen(localStorage.getItem(ONBOARDING_KEY) === "seen");
    const agent = navigator.userAgent;
    const supported = /Chrome|Chromium|Edg\//.test(agent) && !/Firefox/.test(agent);
    setBrowserReady(supported);
    setBrowserLabel(supported ? "Chromium browser detected" : "Use Chrome, Edge, or another Chromium browser");

    Promise.all([
      fetch(`${API}/providers`, { cache: "no-store" }).then(readJson<{ providers: Provider[] }>),
      fetch(`${API}/providers/health`, { cache: "no-store" }).then(readJson<{ runtime?: string; providers?: Provider[] }>),
    ]).then(([catalog, health]) => {
      setProviders(health.providers?.length ? health.providers : catalog.providers || []);
      setProviderRuntime(health.runtime || "unknown");
    }).catch((reason: unknown) => {
      setProviderRuntime("unavailable");
      setProviderError(reason instanceof Error ? reason.message : "Provider status is unavailable.");
    });
  }, []);

  function markOnboardingSeen() {
    localStorage.setItem(ONBOARDING_KEY, "seen");
    setOnboardingSeen(true);
  }

  return (
    <>
      <header className="tg-hero">
        <div className="jx-wrap jx-wrap--wide tg-hero__grid">
          <div>
            <span className="jx-eyebrow"><span className="jx-tick" />Travel Price Guardian</span>
            <h1 className="jx-display">Open the trip page. Jacobi does the checking.</h1>
          </div>
          <div className="tg-hero__aside">
            <p>After one-time Automatic Savings consent, the extension detects a supported flight or hotel page, extracts only bounded trip facts, queries configured providers, and keeps the result in a side panel. No itinerary re-entry. No search form. No second start button.</p>
            <div className="tg-hero__actions">
              <Link href="/extension#install" className="tg-button" onClick={markOnboardingSeen}>{onboardingSeen ? "Open extension setup" : "Load the extension"}</Link>
              <Link href="/developers" className="tg-text-link">Developer API</Link>
            </div>
            <nav aria-label="Travel Guardian sections"><a href="#onboarding">Onboarding</a><a href="#status">Status</a><a href="#history">History</a><a href="#evidence">Evidence</a><a href="#providers">Providers</a><a href="#settings">Settings</a></nav>
          </div>
        </div>
      </header>

      <section className="tg-onboarding" id="onboarding">
        <div className="jx-wrap jx-wrap--wide tg-onboarding__grid">
          <span className="tg-step">First-run path</span>
          <div>
            <h2>{onboardingSeen ? "Extension setup opened on this device" : "Install once. Then keep browsing normally."}</h2>
            <p>Load Jacobi’s unpacked extension, open a supported flight or hotel detail page, and open the side panel. Detection and comparison continue automatically from that page; you never type the route or property again.</p>
          </div>
          <Link href="/extension#install" className="tg-button" onClick={markOnboardingSeen}>Setup instructions</Link>
        </div>
      </section>

      <div className="jx-wrap jx-wrap--wide tg-workspace">
        <section className="tg-ledger-section" id="status">
          <div className="tg-section-head"><span className="tg-step">01 / Status</span><div><h2>One open page becomes the search intent.</h2><p>This website cannot inspect Chrome’s private extension state. The side panel is the source of truth for the active page, capability token, provider progress, and revalidation.</p></div></div>
          <div className="tg-status-layout">
            <div className="tg-detection">
              <div className="tg-detection__head"><StatusDot state={browserReady ? "ready" : "unavailable"} /><div><span>Browser readiness</span><strong>{browserLabel}</strong></div></div>
              <ol>
                <li className={onboardingSeen ? "is-done" : ""}><span>01</span><div><strong>Load Jacobi</strong><small>Repository build today; store review remains external.</small></div></li>
                <li><span>02</span><div><strong>Open a supported trip page</strong><small>Flight itinerary/detail or hotel property/rate context.</small></div></li>
                <li><span>03</span><div><strong>Detection runs automatically after consent</strong><small>Route or property, dates, occupancy, cabin, baggage, and selected price are read from the active page. Privacy Mode waits for your click.</small></div></li>
                <li><span>04</span><div><strong>Result stays beside the page</strong><small>Provider status, equivalence, mandatory costs, evidence, and fresh revalidation remain in the side panel.</small></div></li>
              </ol>
              <Link href="/extension#install" className="tg-button tg-button--quiet" onClick={markOnboardingSeen}>{onboardingSeen ? "Review extension setup" : "Load Jacobi"}</Link>
            </div>

            <article className="tg-extension-result">
              <div className="tg-extension-result__head"><span>Fixture walkthrough</span><b>not live inventory</b></div>
              <div className="tg-extension-result__route"><span>Detected from supported page</span><strong>DXB → LHR</strong><small>01 Feb 2027 · economy · 1 checked bag</small></div>
              <div className="tg-extension-result__prices"><div><span>Page observation</span><b>AED 1,500</b></div><div><span>Returned comparable</span><b>AED 1,210</b></div></div>
              <div className="tg-badges"><span>exact fixture match</span><span>conditional difference</span><span>revalidate required</span></div>
              <p>Sanitized fixture data shows the disclosure pattern only. “Returned comparable” means the top eligible offer from configured providers—not the lowest price on the internet.</p>
            </article>
          </div>
        </section>

        <section className="tg-ledger-section" id="history">
          <div className="tg-section-head"><span className="tg-step">02 / History</span><div><h2>History stays with the extension that observed it.</h2><p>The website does not copy capability tokens or browsing context out of extension storage. Recent checks appear in the side panel on the device that ran them.</p></div></div>
          <div className="tg-history">
            <div><span>fixture</span><strong>DXB → LHR</strong><small>Walkthrough only · not a saved search</small><code>fixture_travel_walkthrough</code></div>
          </div>
          <p className="tg-fineprint">No real trip history is rendered on this website. Open the Jacobi side panel on a supported page to see device-local checks and run a fresh revalidation.</p>
        </section>

        <section className="tg-ledger-section" id="evidence">
          <div className="tg-section-head"><span className="tg-step">03 / Evidence</span><div><h2>Evidence follows the detected offer.</h2><p>The extension result retains observation method and time, provider environment, equivalence reasoning, cost completeness, limitations, and a manifest reference.</p></div></div>
          <div className="tg-evidence">
            <div><span>Fixture evidence manifest</span><code>fixture_travel_walkthrough</code><p>{environmentCopy("fixture")}</p><small>Route · cabin · baggage basis · selected page price · returned provider price</small></div>
            <div><span>Revalidation boundary</span><code>fresh check required before action</code><p>An observation is not a booking promise. Price and availability can change.</p><small>Redirect eligibility is shown only after provider confirmation.</small></div>
          </div>
        </section>

        <section className="tg-ledger-section" id="providers">
          <div className="tg-section-head"><span className="tg-step">04 / Providers</span><div><h2>Supply labels without euphemism.</h2><p>Status comes from `/api/v2/travel`. Unconfigured supply is shown as unconfigured; sandbox inventory is not called live; configured coverage is never called the whole market.</p></div></div>
          <div className="tg-provider-runtime"><StatusDot state={providerRuntime === "healthy" ? "ready" : providerRuntime === "checking" ? "waiting" : "unavailable"} />Runtime: {providerRuntime}</div>
          {providerError ? <p className="tg-error">{providerError}</p> : null}
          <div className="tg-providers">
            {providers.length ? providers.map((provider) => <article key={provider.provider_id || provider.display_name}><div><span>{provider.official ? "official API" : "provider"}</span><h3>{provider.display_name || provider.provider_id}</h3></div><strong className={provider.configured ? "is-ready" : ""}>{provider.configured ? "configured" : "unconfigured"}</strong><p>{environmentCopy(provider.data_label)}</p><small>{provider.verticals?.join(" + ") || "Verticals not reported"} · health {provider.health || "unknown"}</small></article>) : providerError ? <div className="tg-provider-empty">No provider capability data was returned. Jacobi will not imply that supply is available.</div> : <div className="tg-skeleton" aria-label="Loading provider catalog"><i /><i /></div>}
          </div>
        </section>

        <section className="tg-ledger-section" id="settings">
          <div className="tg-section-head"><span className="tg-step">05 / Settings</span><div><h2>Automatic where it should be. Conservative everywhere else.</h2><p>Preferences are managed in extension settings and applied to supported active pages. This website shows the default contract without pretending to sync private extension storage.</p></div></div>
          <div className="tg-settings-readout">
            <div><span>Privacy boundary</span><strong>On</strong><p>Trip and offer facts only; no passenger identity, passport, payment credentials, full browsing history, or raw page HTML.</p></div>
            <div><span>Supported-page detection</span><strong>Automatic after consent</strong><p>No itinerary re-entry and no separate search submission after the page is recognized. Privacy Mode remains click-to-send.</p></div>
            <div><span>Provider environment</span><strong>Always visible</strong><p>Fixture, sandbox API, and live official API labels are never collapsed into a generic “live” badge.</p></div>
            <div><span>Telemetry</span><strong>Off by default</strong><p>Self-hosted operation does not require default product telemetry.</p></div>
          </div>
          <div className="tg-secondary-tools"><span>Actions</span><Link href="/extension#install" onClick={markOnboardingSeen}>Extension setup & settings</Link><Link href="/compare">Retail exact-product compare</Link><Link href="/chat">Deep Audit</Link><Link href="/developers">Developer API</Link></div>
        </section>
      </div>
    </>
  );
}
