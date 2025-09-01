import { LifeClient } from "./client";

export const createLifeClient = (...args: unknown[]) => {
  console.log(args);
  return new LifeClient();
};
