import * as React from "react";
import { cn } from "cn";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "./button";

interface ErrorStateProps extends React.ComponentProps<"div"> {
  title?: string;
  message: string;
  onRetry?: () => void;
  action?: React.ReactNode;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  action,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-destructive/20 bg-destructive/5 p-6 sm:p-8 text-center flex flex-col items-center justify-center max-w-lg mx-auto",
        className
      )}
      {...props}
    >
      <div className="size-11 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-3.5">
        <AlertCircle className="size-5" />
      </div>

      <h3 className="font-heading text-base font-bold text-foreground">
        {title}
      </h3>

      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
        {message}
      </p>

      {(onRetry || action) && (
        <div className="mt-5 flex items-center gap-2.5">
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="text-xs font-mono gap-1.5 cursor-pointer"
            >
              <RotateCcw className="size-3.5" />
              <span>Retry</span>
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
