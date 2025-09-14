export const SPAN_ID_BYTES = 8;
export const TRACE_ID_BYTES = 16;
export const LOG_ID_BYTES = 16;
export const METRIC_ID_BYTES = 16;

const SHARED_CHAR_CODES_ARRAY = new Array(32);

/**
 * Copyright The OpenTelemetry Authors - Apache License, Version 2.0
 * Taken from:
 * https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-sdk-trace-base/src/platform/browser/RandomIdGenerator.ts
 */
function getOtelIdGenerator(bytes: number): () => string {
  return function generateId() {
    for (let i = 0; i < bytes * 2; i++) {
      SHARED_CHAR_CODES_ARRAY[i] = Math.floor(Math.random() * 16) + 48;
      // valid hex characters in the range 48-57 and 97-102
      if (SHARED_CHAR_CODES_ARRAY[i] >= 58) {
        SHARED_CHAR_CODES_ARRAY[i] += 39;
      }
    }
    return String.fromCharCode.apply(null, SHARED_CHAR_CODES_ARRAY.slice(0, bytes * 2));
  };
}

export const generateSpanId = getOtelIdGenerator(SPAN_ID_BYTES);
export const generateTraceId = getOtelIdGenerator(TRACE_ID_BYTES);
export const generateLogId = getOtelIdGenerator(LOG_ID_BYTES);
export const generateMetricId = getOtelIdGenerator(METRIC_ID_BYTES);
