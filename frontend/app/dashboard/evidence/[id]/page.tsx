import EvidenceClient from "./evidence-client";

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EvidenceClient id={id} />;
}
