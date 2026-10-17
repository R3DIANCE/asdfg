import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils.ts";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-sky-600 text-white shadow hover:bg-sky-500 active:translate-y-[1px]",
        destructive:
          "bg-rose-600/90 text-white shadow-sm hover:bg-rose-500 active:translate-y-[1px]",
        outline:
          "border border-white/10 bg-zinc-900/80 backdrop-blur-sm text-zinc-200 shadow-sm hover:bg-zinc-800 hover:border-white/20 hover:text-white active:translate-y-[1px]",
        secondary:
          "bg-zinc-800/90 text-zinc-100 shadow-sm hover:bg-zinc-700 active:translate-y-[1px]",
        ghost:
          "text-zinc-300 hover:bg-white/10 hover:text-white active:translate-y-[1px]",
        link: "text-sky-400 underline-offset-4 hover:underline",
        hud: "border border-white/10 bg-zinc-950/80 backdrop-blur-md text-zinc-200 hover:bg-zinc-900 hover:border-sky-400/50 hover:text-white active:translate-y-[1px] shadow-[0_2px_8px_rgba(0,0,0,0.5)]",
        gold: "border border-amber-400/40 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 hover:border-amber-400/60 shadow-sm",
        cyan: "border border-cyan-400/40 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 hover:border-cyan-400/60 shadow-sm",
      },
      size: {
        default: "h-8 px-3 py-1.5",
        sm: "h-7 rounded-md px-2.5 text-[11px]",
        xs: "h-6 rounded px-2 text-[10px]",
        lg: "h-9 rounded-md px-4 text-sm",
        icon: "h-7 w-7 p-0",
        iconSm: "h-6 w-6 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
