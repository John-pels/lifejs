import * as op from "@/shared/operation";
import { LifeClient } from "./client";

export const createLifeClient = (params?: {
  serverUrl?: string;
  serverToken?: string;
}): op.ToPublic<LifeClient> => {
  return op.toPublic(new LifeClient(params));
};
