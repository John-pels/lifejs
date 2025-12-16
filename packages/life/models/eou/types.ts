import type { eouProviders } from "./provider";

export type EOUProvider = (typeof eouProviders)[keyof typeof eouProviders];
