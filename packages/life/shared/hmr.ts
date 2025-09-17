// biome-ignore-all lint/suspicious/noExplicitAny: runtime only

type RawHMR = {
  accept?: (...args: unknown[]) => void;
  dispose?: (cb: () => void) => void;
  addDisposeHandler?: (cb: () => void) => void;
};

const rawHMR: RawHMR | null =
  // - Vite / Bun / modern dev servers
  (typeof import.meta !== "undefined" && (import.meta as any).hot) ||
  // - Webpack ESM
  (typeof import.meta !== "undefined" && (import.meta as any).webpackHot) ||
  // - Webpack CJS
  (globalThis as any)?.module?.hot ||
  // - None
  null;

type HMR = RawHMR & { active: boolean };

export const hmr: HMR = Object.freeze(
  rawHMR
    ? {
        active: true,
        accept: rawHMR.accept ? (...args: unknown[]) => rawHMR.accept?.(...args) : undefined,
        dispose:
          rawHMR.dispose || rawHMR.addDisposeHandler
            ? (cb: () => void) => (rawHMR.dispose || rawHMR.addDisposeHandler)?.(cb)
            : undefined,
      }
    : { active: false },
);
