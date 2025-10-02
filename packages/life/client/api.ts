import type z from "zod";
import type { definition } from "@/server/api/definition";
import type {
  LifeApiCallDefinition,
  LifeApiCastDefinition,
  LifeApiDefinition,
  LifeApiStreamDefinition,
} from "@/server/api/types";
import { canon } from "@/shared/canon";
import { lifeError } from "@/shared/error";
import * as op from "@/shared/operation";
import type { TelemetryClient } from "@/telemetry/clients/base";

// Helper types to extract input/output schemas
type InferInput<T> = T extends { inputDataSchema: z.ZodType }
  ? z.input<T["inputDataSchema"]>
  : undefined;

type InferOutput<T> = T extends { outputDataSchema: z.ZodType }
  ? z.output<T["outputDataSchema"]>
  : undefined;

// Extract handlers by type
type CallHandlers<T extends LifeApiDefinition> = {
  [K in keyof T as T[K] extends LifeApiCallDefinition ? K : never]: T[K];
};

type CastHandlers<T extends LifeApiDefinition> = {
  [K in keyof T as T[K] extends LifeApiCastDefinition ? K : never]: T[K];
};

type StreamHandlers<T extends LifeApiDefinition> = {
  [K in keyof T as T[K] extends LifeApiStreamDefinition ? K : never]: T[K];
};

type UnsubscribeFunction = () => void;

// Constants
const WS_PROTOCOL_REGEX = /^http/;
const TRAILING_SLASH_REGEX = /\/$/;
const SUBSCRIPTION_ID_LENGTH = 16;

export class LifeServerApiClient<Def extends LifeApiDefinition = typeof definition> {
  readonly #telemetry: TelemetryClient;
  readonly #serverUrl: string;
  readonly #serverToken?: string;
  #ws?: WebSocket;
  readonly #subscriptions = new Map<string, (data: unknown) => void>();
  #wsReconnectTimeout?: NodeJS.Timeout;

  constructor(params: { telemetry: TelemetryClient; serverUrl: string; serverToken?: string }) {
    this.#telemetry = params.telemetry;
    this.#serverUrl = params.serverUrl.replace(TRAILING_SLASH_REGEX, "");
    this.#serverToken = params.serverToken;
  }

  private ensureWebSocket(): Promise<WebSocket> {
    if (this.#ws?.readyState === WebSocket.OPEN) return Promise.resolve(this.#ws);

    return new Promise((resolve, reject) => {
      const wsUrl = `${this.#serverUrl.replace(WS_PROTOCOL_REGEX, "ws")}/api/ws`;
      this.#ws = new WebSocket(wsUrl);

      this.#ws.onopen = () => {
        if (this.#ws) resolve(this.#ws);
      };

      this.#ws.onerror = () => {
        reject(lifeError({ code: "Upstream", message: "WebSocket connection failed" }));
      };

      this.#ws.onmessage = (event) => {
        try {
          const [err, message] = canon.parse(event.data);
          if (err) return;
          if (!message || typeof message !== "object" || message === null) return;
          if (!("subscriptionId" in message) || typeof message.subscriptionId !== "string") return;
          const callback = this.#subscriptions.get(message.subscriptionId);
          callback?.(message.data);
        } catch {
          // Silently ignore parse errors
        }
      };

      this.#ws.onclose = () => {
        if (this.#subscriptions.size > 0) {
          this.#wsReconnectTimeout = setTimeout(() => {
            this.ensureWebSocket().catch(() => {
              // Retry silently
            });
          }, 5000);
        }
      };
    });
  }

  async call<K extends keyof CallHandlers<Def>>(handlerId: K, input?: InferInput<Def[K]>) {
    return await this.#telemetry.trace("api.call()", async () => {
      const url = `${this.#serverUrl}/api/http`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };

      if (this.#serverToken) headers.Authorization = `Bearer ${this.#serverToken}`;

      try {
        const [errCanon, body] = canon.stringify({
          handlerId: handlerId as string,
          serverToken: this.#serverToken,
          data: input,
        });
        if (errCanon) return op.failure(errCanon);

        const response = await fetch(url, {
          method: "POST",
          headers,
          body,
        });

        if (!response.ok) {
          try {
            const result = canon.parse(await response.text()) as op.OperationResult<unknown>;
            return op.failure(
              result?.[0] ?? {
                code: "Upstream",
                message: `API call failed: ${response.statusText}`,
              },
            );
          } catch {
            return op.failure({
              code: "Upstream",
              message: `API call failed: ${response.statusText}`,
            });
          }
        }

        const text = await response.text();
        const [err, data] = canon.parse(text) as op.OperationResult<unknown>;
        if (err) return op.failure(err);

        return op.success(data as InferOutput<Def[K]>);
      } catch (error) {
        return op.failure({ code: "Unknown", cause: error });
      }
    });
  }

  cast<K extends keyof CastHandlers<Def>>(
    handlerId: K,
    input?: InferInput<Def[K]>,
  ): Promise<op.OperationResult<undefined>> {
    return this.#telemetry.trace("api.cast()", () => {
      return op.attempt(async () => {
        const ws = await this.ensureWebSocket();
        const [errCanon, body] = canon.stringify({
          type: "cast",
          handlerId: handlerId as string,
          serverToken: this.#serverToken,
          data: input,
        });
        if (errCanon) return op.failure(errCanon);
        ws.send(body);
        return op.success(undefined);
      });
    });
  }

  subscribe<K extends keyof StreamHandlers<Def>>(
    handlerId: K,
    callback: (data: InferOutput<Def[K]>) => void,
    input?: InferInput<Def[K]>,
  ): op.OperationResult<UnsubscribeFunction> {
    return this.#telemetry.trace("api.subscribe()", () => {
      try {
        const subscriptionId = `sub_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 2 + SUBSCRIPTION_ID_LENGTH)}`;

        this.#subscriptions.set(subscriptionId, callback as (data: unknown) => void);

        // Start connection asynchronously
        this.ensureWebSocket()
          .then((ws) => {
            const [errCanon, body] = canon.stringify({
              type: "stream",
              action: "subscribe",
              handlerId: handlerId as string,
              subscriptionId,
              serverToken: this.#serverToken,
              data: input,
            });
            if (errCanon) return op.failure(errCanon);
            ws.send(body);
          })
          .catch(() => {
            this.#subscriptions.delete(subscriptionId);
          });

        const unsubscribe: UnsubscribeFunction = () => {
          this.#subscriptions.delete(subscriptionId);
          if (this.#ws?.readyState === WebSocket.OPEN) {
            const [errCanon, body] = canon.stringify({
              type: "stream",
              action: "unsubscribe",
              handlerId: handlerId as string,
              subscriptionId,
              serverToken: this.#serverToken,
            });
            if (errCanon) return op.failure(errCanon);
            this.#ws.send(body);
          }
        };

        return op.success(unsubscribe);
      } catch (error) {
        return op.failure({ code: "Unknown", cause: error });
      }
    });
  }

  disconnect(): void {
    if (this.#wsReconnectTimeout) {
      clearTimeout(this.#wsReconnectTimeout);
      this.#wsReconnectTimeout = undefined;
    }
    this.#subscriptions.clear();
    if (this.#ws) {
      this.#ws.close();
      this.#ws = undefined;
    }
  }
}
