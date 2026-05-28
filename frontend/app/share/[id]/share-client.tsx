"use client";

import { ResultCard } from "@/components/dashboard";

interface ShareResultClientProps {
  data: any;
}

export function ShareResultClient({ data }: ShareResultClientProps) {
  // Share pages don't have the cockpit's persistent stage above, so the
  // result card embeds its own agent visualization.
  return <ResultCard report={data} embedStage />;
}
