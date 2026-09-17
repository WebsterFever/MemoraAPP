import { render, screen } from "@testing-library/react-native";
import { HealthStatusBadge } from "./health-status-badge";

describe("HealthStatusBadge", () => {
  it("shows a checking message while loading", () => {
    render(<HealthStatusBadge state="loading" />);
    expect(screen.getByText("Checking backend connection…")).toBeTruthy();
  });

  it("shows a connected message when healthy", () => {
    render(<HealthStatusBadge state="ok" />);
    expect(screen.getByText("Backend connected")).toBeTruthy();
  });

  it("shows a degraded message when the database is unreachable", () => {
    render(<HealthStatusBadge state="degraded" />);
    expect(screen.getByText("Backend degraded (database unreachable)")).toBeTruthy();
  });

  it("shows an unreachable message on request failure", () => {
    render(<HealthStatusBadge state="error" />);
    expect(screen.getByText("Backend unreachable")).toBeTruthy();
  });
});
