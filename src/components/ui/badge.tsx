import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils.ts";

export const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 select-none",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-sky-500/20 text-sky-300 border-sky-500/30",
        secondary:
          "border-transparent bg-zinc-800 text-zinc-300 border-zinc-700",
        destructive:
          "border-transparent bg-rose-500/20 text-rose-300 border-rose-500/30",
        outline: "border-white/20 text-zinc-200",
        gold: "border-amber-400/40 bg-amber-400/15 text-amber-300 font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]",
        cyan: "border-cyan-400/40 bg-cyan-400/15 text-cyan-300 font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]",
        crimson: "border-rose-500/40 bg-rose-500/20 text-rose-300 font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]",
        emerald: "border-emerald-400/40 bg-emerald-400/20 text-emerald-300 font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]",
      },
      size: {
        default: "text-xs px-2 py-0.5",
        sm: "text-[10px] px-1.5 py-0.2",
        xs: "text-[8.5px] px-1 py-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}
