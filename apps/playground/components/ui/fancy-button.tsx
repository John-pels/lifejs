import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/cn";

export const fancyButtonOuterVariants = cva(
  "inline-flex shrink-0 cursor-pointer rounded-lg p-[1px] font-normal outline-none transition-all duration-300 hover:brightness-130 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "border border-black bg-gradient-to-t from-black to-gray-500 shadow-sm",
      },
      size: {
        sm: "h-8",
        md: "h-9",
        lg: "h-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export const fancyButtonInnerVariants = cva(
  "inline-flex h-full w-full items-center justify-center whitespace-nowrap rounded-[calc(0.5rem-2px)] text-sm",
  {
    variants: {
      variant: {
        primary: "bg-gradient-to-t from-black to-gray-700 text-primary-foreground shadow-xs",
      },
      size: {
        sm: "gap-1.5 px-3 has-[>svg]:px-2.5",
        md: "gap-2 px-4 py-2 has-[>svg]:px-3",
        lg: "gap-2 px-6 has-[>svg]:px-4",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);
interface FancyButtonProps
  extends React.HTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof fancyButtonInnerVariants>,
    VariantProps<typeof fancyButtonOuterVariants> {}

export function FancyButton({ className, variant, size, children, ...props }: FancyButtonProps) {
  return (
    <button
      className={cn(fancyButtonOuterVariants({ variant, size }), className)}
      type="button"
      {...props}
    >
      <span className={cn(fancyButtonInnerVariants({ variant, size }), className)}>{children}</span>
    </button>
  );
}
