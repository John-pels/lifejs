import { LifeClient } from "./client";

export const createLifeClient = (params?: {
  serverUrl?: string;
  serverToken?: string;
}) => {
  return new LifeClient(params);
};
