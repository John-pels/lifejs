import type { MDXComponents } from "mdx/types";
import type { ComponentPropsWithoutRef } from "react";
import {
  CodeBlockTab,
  CodeBlockTabs,
  CodeBlockTabsList,
  CodeBlockTabsTrigger,
} from "@/components/codeblock-tabs";
import { Tab, Tabs } from "@/components/tabs";

type PreProps = ComponentPropsWithoutRef<"pre"> & {
  "data-language"?: string;
  "data-theme"?: string;
  icon?: string;
};

type FigureProps = ComponentPropsWithoutRef<"figure"> & {
  "data-rehype-pretty-code-figure"?: string;
};

type FigcaptionProps = ComponentPropsWithoutRef<"figcaption"> & {
  "data-rehype-pretty-code-title"?: string;
};

export const components: MDXComponents = {
  h1: (props) => <h1 className="mb-4 font-bold text-2xl" {...props} />,
  h2: (props) => <h2 className="mt-6 mb-3 font-semibold text-xl" {...props} />,
  h3: (props) => <h3 className="mt-4 mb-2 font-medium text-lg" {...props} />,
  p: (props) => <p className="mb-3" {...props} />,
  a: (props) => <a className="text-blue-600 underline" {...props} />,
  ul: (props) => <ul className="mb-3 ml-6 list-disc" {...props} />,
  ol: (props) => <ol className="mb-3 ml-6 list-decimal" {...props} />,
  li: (props) => <li className="mb-1" {...props} />,
  code: (props) => {
    const isInline = typeof props.children === "string";
    if (isInline) {
      return <code className="rounded bg-neutral-100 px-1 font-mono text-sm" {...props} />;
    }
    return <code {...props} />;
  },
  pre: ({ icon, ...props }: PreProps) => (
    <pre className="mb-4 overflow-x-auto font-mono text-sm" {...props} />
  ),
  figure: (props: FigureProps) => {
    if ("data-rehype-pretty-code-figure" in props) {
      return <figure className="mb-4" {...props} />;
    }
    return <figure {...props} />;
  },
  figcaption: (props: FigcaptionProps) => {
    if ("data-rehype-pretty-code-title" in props) {
      return (
        <figcaption
          className="rounded-t-lg border border-neutral-200 border-b-0 bg-neutral-100 px-4 py-2 font-mono text-neutral-600 text-xs"
          {...props}
        />
      );
    }
    return <figcaption {...props} />;
  },
  Tab,
  Tabs,
  CodeBlockTab,
  CodeBlockTabs,
  CodeBlockTabsList,
  CodeBlockTabsTrigger,
};
