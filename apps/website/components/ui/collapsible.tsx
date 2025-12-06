"use client";
import {
  CollapsibleContent as CollapsibleContentRadix,
  CollapsibleTrigger as CollapsibleTriggerRadix,
  Root,
} from "@radix-ui/react-collapsible";
import { type RefObject, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const Collapsible = Root;

const CollapsibleTrigger = CollapsibleTriggerRadix;

const CollapsibleContent = ({
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof CollapsibleContentRadix> & {
  ref?: RefObject<HTMLDivElement | null>;
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <CollapsibleContentRadix
      ref={ref}
      {...props}
      className={cn(
        "overflow-hidden",
        mounted
          ? "data-[state=closed]:animate-fd-collapsible-up data-[state=open]:animate-fd-collapsible-down"
          : "",
        props.className,
      )}
    >
      {children}
    </CollapsibleContentRadix>
  );
};

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
