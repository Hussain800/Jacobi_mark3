import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "../../components/marketing/MarketingShell";
import { PageHeader, SectionMarker, SectionHead } from "../../components/marketing/parts";

export const metadata: Metadata = {
  title: "About JACOBI — Price Integrity Intelligence",
  description:
    "A 24-agent synthetic-buyer audit engine that detects personalized-pricing exposure and MAP/gray-market drift, and produces evidence-grade reports.",
};

const VECTORS = [
  {
    sym: "geo",
    label: "Location",
    desc: "Pricing engines can vary offers by geography. Jacobi runs controlled residential identities across cities and regions to measure location-linked variation — without making a legal conclusion.",
  },
  {
    sym: "dev",
    label: "Device",
    desc: "Device and browser fingerprints can change what a pricing surface returns. Agents rotate operating systems, browsers, and hardware profiles to isolate device-linked variation.",
  },
  {
    sym: "ck",
    label: "Cookies",
    desc: "Session state can change displayed prices, discounts, and availability. Agents use controlled cookie profiles, clean sessions, and repeat-visit states to map session-linked variation.",
  },
  {
    sym: "ref",
    label: "Referrer",
    desc: "Referral source can influence prices and promotions. Agents simulate organic search, price aggregators, and direct navigation to measure referrer-linked variation.",
  },
  {
    sym: "net",
    label: "Network tier",
    desc: "Not all IPs are equal. Residential, datacenter, mobile-carrier, and VPN exits each trigger different pricing logic. Jacobi runs agents across every network tier through managed infrastructure.",
  },
];

const STACK = [
  {
    name: "BrightData Unlocker",
    role: "Fingerprint rotation",
    desc: "Every audit routes through managed infrastructure, rotating device fingerprints, IP addresses, and session parameters to deploy 24 distinct synthetic buyers with real location diversity.",
  },
  {
    name: "DeepSeek · Gemini",
    role: "Extraction & analysis",
    desc: "A dual-model pipeline: one model extracts structured price data from raw HTML, the other evaluates the differentials and writes a plain-language finding on severity.",
  },
  {
    name: "FastAPI",
    role: "Orchestration",
    desc: "A Python async backend coordinates parallel agent sessions, price extraction, and analysis with sub-second routing and real-time telemetry during a probe.",
  },
  {
    name: "Next.js",
    role: "Interface",
    desc: "React server components and a static-first delivery path keep the marketing surface fast; results and dashboards render dynamically inside the authenticated workspace.",
  },
  {
    name: "Supabase",
    role: "Persistence",
    desc: "Postgres stores probe history, accounts, and pricing snapshots. Row-Level Security enforces multi-tenant isolation across every workspace's data.",
  },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      <PageHeader
        eyebrow="What Jacobi is"
        title={<>A measuring instrument for <span className="jx-soft">personalized pricing</span>.</>}
        lede="Twenty-four synthetic buyers probe one URL across geography, device, cookies, referrer, and network — and return evidence, not a story about what a site might do."
        meta={<><span><b>24</b> agents</span><span><b>5</b> variables</span><span>public-web only</span></>}
      />

      <SectionMarker id="01" name="The problem" meta="real · invisible · measurable" />
      <section className="jx-section jx-section--tight">
        <div className="jx-wrap">
          <SectionHead
            eyebrow="What is Jacobi"
            title="Personalized pricing is real, invisible, and now a liability."
          />
          <div className="jx-prose" data-reveal>
            <p>
              Every time you load an e-commerce site, a booking platform, or a SaaS pricing page, the
              server runs a real-time calculation. Location, device, history, referral source, and
              network reputation feed a model that decides what price to show you. The person next to
              you on the same Wi-Fi can see a different number. This is not a bug — it is algorithmic
              price discrimination, deployed at scale across the internet.
            </p>
            <p>
              Twenty-four agents with different digital fingerprints probe the same URL within seconds
              of one another. Each carries a unique identity — a different location, device, cookie
              state, referral origin, and network tier — and captures the raw price the site serves to
              that identity.
            </p>
            <p>
              Then the analysis produces evidence. The pipeline compares prices across all 24 profiles,
              classifies the severity of any spread, and delivers a plain-language finding: which buyer
              context saw which price, sealed into a record a compliance or enforcement team can read.
            </p>
          </div>
        </div>
      </section>

      <div className="jx-sec jx-sec--raised">
        <SectionMarker id="02" name="The vectors" meta="∂price / ∂buyer" />
        <section className="jx-section jx-section--tight">
          <div className="jx-wrap">
            <SectionHead
              eyebrow="The five variables"
              title="What the algorithms look at."
              lede="Each agent varies across these five axes. Together they cover every dimension a pricing model can exploit."
            />
            <div className="jx-vectors" data-reveal>
              {VECTORS.map((v) => (
                <div className="jx-vector" key={v.sym}>
                  <span className="jx-vector__sym">{v.sym}</span>
                  <span className="jx-vector__name">{v.label}</span>
                  <span className="jx-vector__desc">{v.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <SectionMarker id="03" name="The system" meta="industrial-grade infrastructure" />
      <section className="jx-section jx-section--tight">
        <div className="jx-wrap">
          <SectionHead
            eyebrow="Technology"
            title="Built on industrial-grade infrastructure."
            lede="Five core systems power the 24-agent engine, from fingerprint rotation to evidence persistence."
          />
          <div className="jx-stack" data-reveal>
            {STACK.map((t) => (
              <div className="jx-stack__row" key={t.name}>
                <div>
                  <div className="jx-stack__name">{t.name}</div>
                  <div className="jx-stack__role">{t.role}</div>
                </div>
                <p className="jx-stack__desc">{t.desc}</p>
              </div>
            ))}
          </div>

          <div className="jx-endcta" data-reveal>
            <span className="jx-endcta__copy">See it run on a real URL.</span>
            <Link href="/chat" className="jx-btn jx-btn--primary">Run an audit</Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
