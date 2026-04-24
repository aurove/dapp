import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b58f5f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1117]",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-[linear-gradient(135deg,#ccb98f_0%,#a78858_100%)] text-[#1e160b] shadow-[0_10px_30px_rgba(167,136,88,0.35)] hover:brightness-105",
        secondary: "border border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]",
        outline: "border border-white/15 bg-transparent text-white hover:bg-white/[0.06]",
        ghost: "text-white hover:bg-white/[0.06]",
        destructive: "border border-red-500/50 bg-red-500/20 text-red-100 hover:bg-red-500/30",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 px-6",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
