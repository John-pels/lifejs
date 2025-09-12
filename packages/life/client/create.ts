import * as op from "@/shared/operation";
import { LifeClient } from "./client";

export const createLifeClient = (params?: { serverUrl?: string; serverToken?: string }) => {
  return op.toPublic(new LifeClient(params));
};
