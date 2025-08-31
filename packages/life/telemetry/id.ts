const SPAN_ID_BYTES = 8;
const TRACE_ID_BYTES = 16;
const LOG_ID_BYTES = 16;
const METRIC_ID_BYTES = 16;
const SHARED_BUFFER = Buffer.allocUnsafe(16);

/**
 * @dev Taken from https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-sdk-trace-base/src/platform/node/RandomIdGenerator.ts
 */
function generateOtelId(bytes: number): () => string {
  return function generateId() {
    for (let i = 0; i < bytes / 4; i++) {
      // biome-ignore lint/suspicious/noBitwiseOperators: reason
      SHARED_BUFFER.writeUInt32BE((Math.random() * 2 ** 32) >>> 0, i * 4);
    }
    for (let i = 0; i < bytes; i++) {
      const byte = SHARED_BUFFER[i];
      if (byte && byte > 0) break;
      else if (i === bytes - 1) SHARED_BUFFER[i] = 1;
    }
    return SHARED_BUFFER.toString("hex", 0, bytes);
  };
}

export const generateSpanId = generateOtelId(SPAN_ID_BYTES);
export const generateTraceId = generateOtelId(TRACE_ID_BYTES);
export const generateLogId = generateOtelId(LOG_ID_BYTES);
export const generateMetricId = generateOtelId(METRIC_ID_BYTES);
