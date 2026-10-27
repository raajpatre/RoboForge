import { describe, it, expect } from "vitest";
import { PageContainer } from "../page-container";
import { LoadingIndicator, Skeleton } from "../loading-indicator";
import { EmptyState } from "../empty-state";
import { ErrorState } from "../error-state";

describe("Foundation UI Components", () => {
  it("renders PageContainer with correct class names", () => {
    const el = PageContainer({ size: "sm", children: "Hello" });
    expect(el.props.className).toContain("max-w-4xl");

    const lgEl = PageContainer({ size: "lg", children: "Hello" });
    expect(lgEl.props.className).toContain("max-w-7xl");
  });

  it("renders LoadingIndicator with proper status and label", () => {
    const el = LoadingIndicator({ label: "Fetching Hardware...", size: "lg" });
    expect(el).toBeDefined();
    expect(JSON.stringify(el)).toContain("Fetching Hardware...");
  });

  it("renders Skeleton pulse placeholder", () => {
    const el = Skeleton({ className: "h-6 w-32" });
    expect(el.props.className).toContain("animate-pulse");
    expect(el.props.className).toContain("h-6");
  });

  it("renders EmptyState with custom title and description", () => {
    const el = EmptyState({
      title: "No Robotics Orders",
      description: "You have not placed any orders yet.",
    });
    expect(JSON.stringify(el)).toContain("No Robotics Orders");
    expect(JSON.stringify(el)).toContain("You have not placed any orders yet.");
  });

  it("renders ErrorState with title and message", () => {
    const el = ErrorState({
      title: "Connection Failed",
      message: "Could not reach telemetry server.",
    });
    expect(JSON.stringify(el)).toContain("Connection Failed");
    expect(JSON.stringify(el)).toContain("Could not reach telemetry server.");
  });
});
