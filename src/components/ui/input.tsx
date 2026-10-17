import * as React from "react";
import { cn } from "../../lib/utils.ts";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, startIcon, endIcon, ...props }, ref) => {
    if (startIcon || endIcon) {
      return (
        <div className="relative flex items-center w-full">
          {startIcon && (
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none text-zinc-400 z-10">
              {startIcon}
            </div>
          )}
          <input
            type={type}
            className={cn(
              "flex h-8 w-full rounded-md border border-white/15 bg-zinc-950/60 px-3 py-1 text-xs text-white shadow-sm transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400 focus-visible:border-sky-400 disabled:cursor-not-allowed disabled:opacity-50",
              startIcon && "pl-8",
              endIcon && "pr-8",
              className
            )}
            ref={ref}
            {...props}
          />
          {endIcon && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none text-zinc-400 z-10">
              {endIcon}
            </div>
          )}
        </div>
      );
    }

    return (
      <input
        type={type}
        className={cn(
          "flex h-8 w-full rounded-md border border-white/15 bg-zinc-950/60 px-3 py-1 text-xs text-white shadow-sm transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400 focus-visible:border-sky-400 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
