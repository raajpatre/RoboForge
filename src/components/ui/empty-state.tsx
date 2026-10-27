import * as React from "react";
import { cn } from "cn";
import { Inbox } from "lucide-react";

interface EmptyStateProps extends React.ComponentProps<"div"> {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-border/80 bg-card/50 p-8 sm:p-12 text-center flex flex-col items-center justify-center",
        className
      )}
      {...props}
    >
      <div className="size-12 rounded-2xl bg-muted/60 text-muted-foreground flex items-center justify-center mb-4">
        <Icon className="size-6" />
      </div>

      <h3 className="font-heading text-base font-bold text-foreground">
        {title}
      </h3>

      {description && (
        <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-sm">
          {description}
        </p>
      )}

      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
