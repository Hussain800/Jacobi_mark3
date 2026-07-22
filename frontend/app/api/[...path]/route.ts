import { NextRequest, NextResponse } from "next/server";
import { DEMO_REPORT, type TopologyReport } from "@/components/cockpit/types";

export const dynamic = "force-dynamic";

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

function demoReport(sessionId: string): TopologyReport {
  return {
    ...DEMO_REPORT,
    session_id: sessionId,
    timestamp: new Date().toISOString(),
  };
}

async function fallbackResponse(path: string, request: NextRequest, bodyText?: string) {
  if (request.method === "POST" && path === "probe") {
    // Backend unreachable. Return an honest 503 — NEVER fabricate a "completed"
    // probe with simulated discrimination data for a real user scan.
    return json(
      {
        error: "probe_unavailable",
        detail:
          "The probe service is temporarily unavailable. Please try again in a moment.",
      },
      { status: 503 },
    );
  }

  if (
    request.method === "GET" &&
    (path.startsWith("result/") || path.startsWith("share/"))
  ) {
    const prefix = path.startsWith("result/") ? "result/" : "share/";
    const sessionId = decodeURIComponent(path.slice(prefix.length));
    // Only the curated demo / case-study ids may serve static sample data when
    // the backend is down. A real session id gets an honest error — never a
    // fabricated discrimination report.
    if (sessionId === "demo_session_static") {
      return json(demoReport(sessionId));
    }
    return json(
      {
        error: "result_unavailable",
        detail: "The probe service is temporarily unavailable.",
      },
      { status: 503 },
    );
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
    // Analysis is derived from a real completed session. If the backend is
    // unavailable, returning DEMO_REPORT here would make a real live scan
    // appear to have a verdict. The explicit /analyze-demo route is the only
    // fallback that may return curated sample analysis.
    return json(
      {
        error: "analysis_unavailable",
        detail: "The analysis service is temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  if (request.method === "GET" && path === "leaderboard") {
    return json(
      {
        error: "leaderboard_unavailable",
        detail: "The leaderboard service is temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  return json(
    {
      error: "Jacobi backend is unavailable",
      detail: "Start the FastAPI backend or set BACKEND_API_URL to a reachable API.",
    },
    { status: 503 },
  );
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  const path = (params.path || []).join("/");
  const target = `${backendOrigin()}/api/${path}${request.nextUrl.search}`;
  const bodyText = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.text();

  try {
    const headers = new Headers(request.headers);
    headers.delete("host");
    // Don't forward Accept-Encoding — we want the backend to send raw
    // so Next.js can handle compression at the edge.
    headers.set("Accept-Encoding", "identity");

    const response = await fetch(target, {
      method: request.method,
      headers,
      body: bodyText,
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("x-jacobi-api-mode", "backend");
    // Strip encoding headers — we're passing the raw body, Next.js handles compression
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("transfer-encoding");

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
