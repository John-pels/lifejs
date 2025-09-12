import type z from "zod";
import type { definition } from "@/server/api/definition";
import type {
  LifeApiCallDefinition,
  LifeApiCastDefinition,
  LifeApiDefinition,
  LifeApiStreamDefinition,
} from "@/server/api/types";
import { lifeError } from "@/shared/error";
import * as op from "@/shared/operation";

// Helper types to extract input/output schemas
type InferInput<T> = T extends { inputDataSchema: z.ZodSchema }
  ? z.infer<T["inputDataSchema"]>
  : undefined;

type InferOutput<T> = T extends { outputDataSchema: z.ZodSchema }
  ? z.infer<T["outputDataSchema"]>
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
  private readonly serverUrl: string;
  private readonly serverToken?: string;
  private ws?: WebSocket;
  private readonly subscriptions = new Map<string, (data: unknown) => void>();
  private wsReconnectTimeout?: NodeJS.Timeout;

  constructor(params: { serverUrl: string; serverToken?: string }) {
    this.serverUrl = params.serverUrl.replace(TRAILING_SLASH_REGEX, "");
    this.serverToken = params.serverToken;
  }

  private ensureWebSocket(): Promise<WebSocket> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.ws);
    }

    return new Promise((resolve, reject) => {
      const wsUrl = `${this.serverUrl.replace(WS_PROTOCOL_REGEX, "ws")}/ws`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        if (this.ws) resolve(this.ws);
      };

      this.ws.onerror = () => {
        reject(lifeError({ code: "Upstream", message: "WebSocket connection failed" }));
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const callback = this.subscriptions.get(message.subscriptionId);
          callback?.(message.data);
        } catch {
          // Silently ignore parse errors
        }
      };

      this.ws.onclose = () => {
        if (this.subscriptions.size > 0) {
          this.wsReconnectTimeout = setTimeout(() => {
            this.ensureWebSocket().catch(() => {
              // Retry silently
            });
          }, 5000);
        }
      };
    });
  }

  async call<K extends keyof CallHandlers<Def>>(handlerId: K, input?: InferInput<Def[K]>) {
    const url = `${this.serverUrl}/api/${handlerId as string}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.serverToken) {
      headers.Authorization = `Bearer ${this.serverToken}`;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          handlerId: handlerId as string,
          serverToken: this.serverToken,
          data: input,
        }),
      });

      if (!response.ok) {
        await response.text(); // Consume body to avoid memory leak
        return op.failure({
          code: "Upstream",
          message: `API call failed: ${response.statusText}`,
        });
      }

      const result = await response.json();
      if (result.error) {
        return op.failure(result.error);
      }

      return op.success(result.data as InferOutput<Def[K]>);
    } catch (error) {
      return op.failure({
        code: "Unknown",
        message: "Network request failed",
        error,
      });
    }
  }

  cast<K extends keyof CastHandlers<Def>>(
    handlerId: K,
    input?: InferInput<Def[K]>,
  ): Promise<op.OperationResult<undefined>> {
    return op.attempt(async () => {
      const ws = await this.ensureWebSocket();
      ws.send(
        JSON.stringify({
          type: "cast",
          handlerId: handlerId as string,
          serverToken: this.serverToken,
          data: input,
        }),
      );
      return op.success(undefined);
    });
  }

  subscribe<K extends keyof StreamHandlers<Def>>(
    handlerId: K,
    callback: (data: InferOutput<Def[K]>) => void,
    input?: InferInput<Def[K]>,
  ): op.OperationResult<UnsubscribeFunction> {
    return op.attempt(() => {
      const subscriptionId = `sub_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 2 + SUBSCRIPTION_ID_LENGTH)}`;

      this.subscriptions.set(subscriptionId, callback as (data: unknown) => void);

      // Start connection asynchronously
      this.ensureWebSocket()
        .then((ws) => {
          ws.send(
            JSON.stringify({
              type: "stream",
              action: "subscribe",
              handlerId: handlerId as string,
              subscriptionId,
              serverToken: this.serverToken,
              data: input,
            }),
          );
        })
        .catch(() => {
          this.subscriptions.delete(subscriptionId);
        });

      const unsubscribe: UnsubscribeFunction = () => {
        this.subscriptions.delete(subscriptionId);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({
              type: "stream",
              action: "unsubscribe",
              handlerId: handlerId as string,
              subscriptionId,
              serverToken: this.serverToken,
            }),
          );
        }
      };

      return op.success(unsubscribe);
    });
  }

  disconnect(): void {
    if (this.wsReconnectTimeout) {
      clearTimeout(this.wsReconnectTimeout);
      this.wsReconnectTimeout = undefined;
    }
    this.subscriptions.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }
}
