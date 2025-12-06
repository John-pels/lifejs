"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { File as FileIcon, Folder as FolderIcon, FolderOpen } from "lucide-react";
import { type HTMLAttributes, type ReactNode, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/cn";

const itemVariants = cva(
  "flex flex-row items-center gap-2 rounded-md px-2 py-1.5 text-sm [&_svg]:size-4",
  {
    variants: {
      highlight: {
        true: "bg-fd-accent font-semibold",
        false: "",
      },
      dim: {
        true: "text-fd-muted-foreground opacity-50",
        false: "hover:bg-fd-accent hover:text-fd-accent-foreground",
      },
    },
    defaultVariants: {
      highlight: false,
      dim: false,
    },
  },
);

type ItemVariants = VariantProps<typeof itemVariants>;

export function Files({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div className={cn("not-prose rounded-md border bg-fd-card p-2", className)} {...props}>
      {props.children}
    </div>
  );
}

export interface FileProps extends HTMLAttributes<HTMLDivElement>, ItemVariants {
  name: string;
  icon?: ReactNode;
  optional?: boolean;
}

export interface FolderProps extends HTMLAttributes<HTMLDivElement>, ItemVariants {
  name: string;
  optional?: boolean;

  disabled?: boolean;

  /**
   * Open folder by default
   *
   * @defaultValue false
   */
  defaultOpen?: boolean;
}

function formatName(name: string, optional?: boolean) {
  if (optional) {
    return (
      <>
        {name}
        <span className="font-normal text-neutral-400">(optional)</span>
      </>
    );
  }
  return name;
}

export function File({
  name,
  icon = <FileIcon />,
  highlight,
  dim,
  optional,
  className,
  ...rest
}: FileProps): React.ReactElement {
  return (
    <div className={cn(itemVariants({ highlight, dim, className }))} {...rest}>
      {icon}
      {formatName(name, optional)}
    </div>
  );
}

export function Folder({
  name,
  defaultOpen = false,
  highlight,
  dim,
  optional,
  className,
  ...props
}: FolderProps): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible onOpenChange={setOpen} open={open} {...props}>
      <CollapsibleTrigger
        className={cn(itemVariants({ highlight, dim, className: cn("w-full", className) }))}
      >
        {open ? <FolderOpen /> : <FolderIcon />}
        {formatName(name, optional)}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ms-2 flex flex-col border-l ps-2">{props.children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
