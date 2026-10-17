import * as React from "react";
import { cn } from "../../lib/utils.ts";

export interface ProgressProps
  extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  indicatorClassName?: string;
  showGlassSheen?: boolean;
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, indicatorClassName, showGlassSheen = true, ...props }, ref) => {
    const safeVal = Math.min(100, Math.max(0, value));
    return (
      <div
        ref={ref}
        className={cn(
          "relative h-3.5 w-full overflow-hidden rounded-[3px] bg-zinc-950/80 border border-white/10 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full w-full flex-1 transition-all duration-300 relative rounded-[2px]",
            indicatorClassName || "bg-sky-500"
          )}
          style={{ width: `${safeVal}%` }}
        >
          {showGlassSheen && (
            <div className="absolute top-0 left-0 right-0 h-[40%] bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />
          )}
        </div>
      </div>
    );
  }
);
Progress.displayName = "Progress";
