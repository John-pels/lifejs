import { MouseProvider } from "@zenobius/ink-mouse";
import type { ReactNode } from "react";

export const ConditionalMouseProvider = (params: { children: ReactNode; enabled: boolean }) => {
  if (params.enabled) return <MouseProvider>{params.children}</MouseProvider>;
  return params.children;
};
