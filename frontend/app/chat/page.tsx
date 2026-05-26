import Terminal from "../../components/dashboard";
import ErrorBoundary from "../../components/ErrorBoundary";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <ErrorBoundary>
      <Terminal />
    </ErrorBoundary>
  );
}
