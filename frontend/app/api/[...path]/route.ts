import { NextRequest, NextResponse } from "next/server";
import { DEMO_REPORT, SAMPLES, type TopologyReport } from "@/components/cockpit/types";

export const dynamic = "force-dynamic";

type FallbackSession = {
  target_url: string;
  target_name: string;
};

const globalForFallback = globalThis as typeof globalThis & {
  __jacobiFallbackSessions?: Map<string, FallbackSession>;
};

const fallbackSessions =
  globalForFallback.__jacobiFallbackSessions ??
  (globalForFallback.__jacobiFallbackSessions = new Map<string, FallbackSession>());

function backendOrigin() {
  return (
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000"
  ).replace(/\/+$/, "");
}

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "x-jacobi-api-mode": "fallback",
      ...(init?.headers || {}),
    },
  });
}

function inferName(targetUrl: string, targetName?: string) {
  if (targetName && !targetName.startsWith("UA123 JFK")) return targetName;
  const sample = SAMPLES.find((s) => s.url === targetUrl);
  if (sample) return sample.label;

  try {
    const url = new URL(targetUrl);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return targetUrl || "Probe";
  }
}

function demoReport(sessionId: string, session?: FallbackSession): TopologyReport {
  return {
    ...DEMO_REPORT,
    session_id: sessionId,
    target_url: session?.target_url || DEMO_REPORT.target_url,
    target_name: session?.target_name || DEMO_REPORT.target_name,
    timestamp: new Date().toISOString(),
  };
}

function parseBody<T>(bodyText?: string): T | Record<string, never> {
  if (!bodyText) return {};
  try {
    return JSON.parse(bodyText) as T;
  } catch {
    return {};
  }
}

async function fallbackResponse(path: string, request: NextRequest, bodyText?: string) {
  if (request.method === "POST" && path === "probe") {
    const body = parseBody<{ target_url?: string; target_name?: string }>(bodyText);

    const targetUrl = body.target_url || DEMO_REPORT.target_url;
    const sessionId = `fallback_${Date.now().toString(36)}`;
    fallbackSessions.set(sessionId, {
      target_url: targetUrl,
      target_name: inferName(targetUrl, body.target_name),
    });

    return json({
      session_id: sessionId,
      status: "completed",
      warning:
        "Backend probe service is unavailable. Showing simulated Jacobi results so the cockpit can continue.",
    });
  }

  if (request.method === "GET" && path.startsWith("result/")) {
    const sessionId = decodeURIComponent(path.slice("result/".length));
    return json(demoReport(sessionId, fallbackSessions.get(sessionId)));
  }

  if (request.method === "GET" && path.startsWith("share/")) {
    const sessionId = decodeURIComponent(path.slice("share/".length));
    return json(demoReport(sessionId, fallbackSessions.get(sessionId)));
  }

  if (request.method === "GET" && path === "analyze-demo") {
    return json({
      session_id: "demo_analyzed",
      target_name: DEMO_REPORT.target_name,
      topology_class: DEMO_REPORT.topology_class,
      baseline_price: DEMO_REPORT.baseline_price,
      gemini_report: null,
      savings_verdict: null,
    });
  }

  if (request.method === "POST" && path === "analyze") {
    const body = parseBody<{ use_data_dir?: string; target_url?: string; target_name?: string }>(bodyText);

    const sessionId = body.use_data_dir || "demo_session_static";
    const session = fallbackSessions.get(sessionId);

    return json({
      session_id: sessionId,
      target_name: session?.target_name || body.target_name || DEMO_REPORT.target_name,
      topology_class: DEMO_REPORT.topology_class,
      baseline_price: DEMO_REPORT.baseline_price,
      gemini_report: null,
      savings_verdict: null,
    });
  }

  if (request.method === "GET" && path === "leaderboard") {
    return json([
      { name: "Leela Palace Bangalore", savings: 57, url: DEMO_REPORT.target_url },
      { name: "Tokyo Hotels Search", savings: 42, url: "https://www.booking.com/searchresults.html?ss=Tokyo" },
      { name: "Wireless Headphones", savings: 18, url: "https://www.amazon.com/s?k=wireless+headphones" },
    ]);
  }

  return json(
    {
      error: "Jacobi backend is unavailable",
      detail: "Start the FastAPI backend or set BACKEND_API_URL to a reachable API.",
    },
    { status: 503 },
  );
}

async function proxy(request: NextRequest, context: { params: { path?: string[] } }) {
  const path = (context.params.path || []).join("/");
  const target = `${backendOrigin()}/api/${path}${request.nextUrl.search}`;
  const bodyText = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.text();

  try {
    const headers = new Headers(request.headers);
    headers.delete("host");

    const response = await fetch(target, {
      method: request.method,
      headers,
      body: bodyText,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("x-jacobi-api-mode", "backend");

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return fallbackResponse(path, request, bodyText);
  }
}

export const GET = proxy;
export const POST = proxy;
