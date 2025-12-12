import type { HandlerDefinition, HandlerStateDefinition } from "./types";

const handler = <
  Name extends string,
  StateDef extends HandlerStateDefinition,
  HandlerDef extends HandlerDefinition<Name, StateDef>,
>(
  definition: HandlerDef,
) => definition;

export const handlersDefinition = [
  handler({
    name: "test",
    mode: "block",
    state: {
      count: 0,
    },
    onEvent: ({ state }) => {
      console.log(state);
      return 8;
    },
  }),
  handler({
    name: "test2",
    mode: "block",
    state: {
      count: 0,
    },
    onEvent: ({ state }) => {
      console.log(state);
    },
  }),
] as const;
