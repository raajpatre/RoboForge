import { Suspense } from "react";
import type { Metadata } from "next";
import { TrackOrderClient } from "./track-client";

export const metadata: Metadata = {
  title: "Track Order | RoboForge",
  description:
    "Zero-account, possession-based cryptographic order tracking for robotics hardware orders.",
};

interface TrackPageProps {
  searchParams: Promise<{
    code?: string;
    confirmed?: string;
  }>;
}

export default async function TrackPage({ searchParams }: TrackPageProps) {
  const resolvedParams = await searchParams;
  const initialCode = (resolvedParams.code || "").trim();
  const initialConfirmed = resolvedParams.confirmed === "true";

  return (
    <main className="min-h-[calc(100vh-8rem)]">
      <Suspense
        fallback={
          <div className="container mx-auto max-w-4xl px-4 py-16 text-center">
            <div className="size-8 mx-auto animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-4 text-xs font-mono text-muted-foreground">
              Initializing tracking session...
            </p>
          </div>
        }
      >
        <TrackOrderClient
          initialCode={initialCode}
          initialConfirmed={initialConfirmed}
        />
      </Suspense>
    </main>
  );
}
