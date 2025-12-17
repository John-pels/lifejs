import type { eouProviders } from ".";

export type EOUProvider = (typeof eouProviders)[keyof typeof eouProviders];
