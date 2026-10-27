import * as React from "react";
import { cn } from "cn";

interface PageContainerProps extends React.ComponentProps<"div"> {
  size?: "default" | "sm" | "lg" | "full";
}

export function PageContainer({
  className,
  size = "default",
  children,
  ...props
}: PageContainerProps) {
  const maxWClass =
    size === "sm"
      ? "max-w-4xl"
      : size === "lg"
      ? "max-w-7xl"
      : size === "full"
      ? "max-w-full"
      : "max-w-6xl";

  return (
    <div
      className={cn("container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12", maxWClass, className)}
      {...props}
    >
      {children}
    </div>
  );
}
