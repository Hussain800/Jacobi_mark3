"use client";

import { ResultCard } from "@/components/dashboard";

interface ShareResultClientProps {
  data: any;
}

export function ShareResultClient({ data }: ShareResultClientProps) {
  return <ResultCard report={data} />;
}
