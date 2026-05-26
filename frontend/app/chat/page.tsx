"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Terminal from "../../components/dashboard";
import ErrorBoundary from "../../components/ErrorBoundary";

export const dynamic = "force-dynamic";

function ChatPageInner() {
  const searchParams = useSearchParams();
  const initialUrl = searchParams.get("url") || undefined;
  return <Terminal initialUrl={initialUrl} />;
}

export default function ChatPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="h-screen bg-[#050505]" />}>
        <ChatPageInner />
      </Suspense>
    </ErrorBoundary>
  );
}
