import type Mdast from "mdast";

declare module "mdast" {
  // Augment the default `mdast` node type with extra properties
  // - `key` is used as React key for proper memoization
  // - `partial` is used to indicate that the node is a partial markdown sequence that has been repaired
  interface Node {
    key?: number;
    partial?: boolean;
  }

  interface LifeInterrupted extends Mdast.Node {
    type: "lifeInterrupted";
    author: "user" | "agent";
    partial?: boolean;
  }

  interface LifeInlineAction extends Mdast.Node {
    type: "lifeInlineAction";
    name: string;
    input: Record<string, unknown> | undefined;
  }

  // Register Life.ks custom node types in the `mdast` namespace
  interface RootContentMap {
    // `interrupted` catches the `[Interrupted by <user|agent>]` sequence produced
    // by the generation plugin, when either the user or the agent interrupts the other.
    lifeInterrupted: LifeInterrupted;
    // `inlineAction` catches the `execute::<name>(<input>)` sequence produced
    // by the LLM to call a given action inline (as they speak).
    lifeInlineAction: LifeInlineAction;
  }
}
