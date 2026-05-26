import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

// ─── State Interfaces ────────────────────────────────────────────────

export interface AgentNode {
  id: string;
  geo: { lat: number; lng: number };
  status: "active" | "idle" | "offline";
  ping: number;
  price: number;
  exitIp: string;
}

export interface ProxyNode {
  id: string;
  exitIp: string;
  reputationScore: number;
  latitude: number;
  longitude: number;
}

export interface PricingEvent {
  id: string;
  timestamp: number;
  sku: string;
  price: number;
  agentId: string;
  proxyIp: string;
}

// ─── Store Shape ─────────────────────────────────────────────────────

interface TelemetryState {
  /** Indexed by agent id */
  agents: Record<string, AgentNode>;
  /** Indexed by proxy id */
  proxies: Record<string, ProxyNode>;
  events: PricingEvent[];
  selectedAgentId: string | null;
  selectedProxyIp: string | null;
  temporalBrushRange: [number, number];
  isSimulationActive: boolean;
}

interface TelemetryActions {
  /** Bulk-replace all telemetry data (agents, proxies, events). */
  setTelemetryData: (
    agents: Record<string, AgentNode>,
    proxies: Record<string, ProxyNode>,
    events: PricingEvent[],
  ) => void;
  selectAgent: (agentId: string | null) => void;
  selectProxy: (proxyIp: string | null) => void;
  setTemporalBrush: (range: [number, number]) => void;
  toggleSimulation: () => void;
  resetStore: () => void;
}

type TelemetryStore = TelemetryState & TelemetryActions;

// ─── Initial State ───────────────────────────────────────────────────

const initialState: TelemetryState = {
  agents: {},
  proxies: {},
  events: [],
  selectedAgentId: null,
  selectedProxyIp: null,
  temporalBrushRange: [0, Date.now()],
  isSimulationActive: false,
};

// ─── Store ───────────────────────────────────────────────────────────

export const useTelemetryStore = create<TelemetryStore>()((set) => ({
  ...initialState,

  setTelemetryData: (agents, proxies, events) =>
    set({ agents, proxies, events }),

  selectAgent: (agentId) => set({ selectedAgentId: agentId }),

  selectProxy: (proxyIp) => set({ selectedProxyIp: proxyIp }),

  setTemporalBrush: (range) => set({ temporalBrushRange: range }),

  toggleSimulation: () =>
    set((state) => ({ isSimulationActive: !state.isSimulationActive })),

  resetStore: () => set(initialState),
}));

// ─── Derived Selectors ──────────────────────────────────────────────

/**
 * Returns events filtered by the current temporal brush range
 * and, when an agent is selected, scoped to that agent.
 *
 * Uses `useShallow` to prevent unnecessary re-renders when the
 * reference-equal array contents haven't changed.
 */
export function useFilteredEvents(): PricingEvent[] {
  return useTelemetryStore(
    useShallow((state) => {
      const [start, end] = state.temporalBrushRange;
      return state.events.filter((e) => {
        const inRange = e.timestamp >= start && e.timestamp <= end;
        const matchesAgent =
          state.selectedAgentId === null ||
          e.agentId === state.selectedAgentId;
        return inRange && matchesAgent;
      });
    }),
  );
}

/**
 * Returns only agents whose status is `'active'`.
 *
 * Uses `useShallow` for shallow-equality diffing on the
 * derived record so consumers re-render only when the set of
 * active agents actually changes.
 */
export function useActiveAgents(): Record<string, AgentNode> {
  return useTelemetryStore(
    useShallow((state) =>
      Object.fromEntries(
        Object.entries(state.agents).filter(
          ([, agent]) => agent.status === "active",
        ),
      ),
    ),
  );
}
