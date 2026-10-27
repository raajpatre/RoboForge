import * as React from "react";
import { cn } from "cn";

interface LoadingIndicatorProps extends React.ComponentProps<"div"> {
  size?: "sm" | "default" | "lg";
  label?: string;
  fullPage?: boolean;
}

export function LoadingIndicator({
  className,
  size = "default",
  label,
  fullPage = false,
  ...props
}: LoadingIndicatorProps) {
  const spinnerSize =
    size === "sm"
      ? "size-4 border-2"
      : size === "lg"
      ? "size-10 border-3"
      : "size-6 border-2";

  const content = (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3",
        fullPage ? "min-h-[60vh]" : "py-8",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "animate-spin rounded-full border-primary border-t-transparent",
          spinnerSize
        )}
        role="status"
        aria-label={label || "Loading..."}
      />
      {label && (
        <p className="text-xs font-mono text-muted-foreground animate-pulse">
          {label}
        </p>
      )}
    </div>
  );

  return content;
}

export function Skeleton({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted/60", className)}
      {...props}
    />
  );
}
