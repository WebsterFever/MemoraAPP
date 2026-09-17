import { StyleSheet, Text, View } from "react-native";

export type HealthBadgeState = "loading" | "ok" | "degraded" | "error";

export interface HealthStatusBadgeProps {
  state: HealthBadgeState;
}

const COPY: Record<HealthBadgeState, string> = {
  loading: "Checking backend connection…",
  ok: "Backend connected",
  degraded: "Backend degraded (database unreachable)",
  error: "Backend unreachable",
};

const COLOR: Record<HealthBadgeState, string> = {
  loading: "#8a8a8a",
  ok: "#1f9254",
  degraded: "#b8860b",
  error: "#c0392b",
};

/**
 * Temporary Phase 1 proof that the mobile app can reach the API — not part
 * of the eventual product UI. Real design-system components land as
 * features are built (see docs/architecture/09-mobile-architecture.md §4).
 */
export function HealthStatusBadge({ state }: HealthStatusBadgeProps) {
  return (
    <View style={styles.container} testID="health-status-badge">
      <View style={[styles.dot, { backgroundColor: COLOR[state] }]} />
      <Text style={styles.label}>{COPY[state]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
  },
});
