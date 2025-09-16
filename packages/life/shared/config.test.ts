import { describe, expect, test } from "vitest";
import z from "zod";
import { createConfig, createConfigUnion } from "./config";

describe("createConfig", () => {
  test("should return a config with both schema and schemaTelemetry", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const config = createConfig({ schema });

    expect(config.schema).toBeDefined();
    expect(config.schemaTelemetry).toBeDefined();
  });

  test("should transform to empty object by default", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      email: z.string(),
    });

    const config = createConfig({ schema });
    const input = { name: "John", age: 30, email: "john@example.com" };

    const parsed = config.schema.parse(input);
    const telemetry = config.schemaTelemetry.parse(input) as any;

    expect(parsed).toEqual(input);
    expect(telemetry).toEqual({});
  });

  test("should transform data using toTelemetryAttribute function", () => {
    const schema = z.object({
      name: z.string(),
      password: z.string(),
      email: z.string(),
    });

    const config = createConfig({
      schema,
      toTelemetryAttribute: (data) => ({
        name: data.name,
        email: data.email,
      }),
    });

    const input = { name: "John", password: "secret123", email: "john@example.com" };
    const telemetry = config.schemaTelemetry.parse(input) as any;

    expect(telemetry).toEqual({
      name: "John",
      email: "john@example.com",
    });
  });

  test("should exclude nested fields using transformation", () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        credentials: z.object({
          username: z.string(),
          password: z.string(),
        }),
      }),
      settings: z.object({
        theme: z.string(),
      }),
    });

    const config = createConfig({
      schema,
      toTelemetryAttribute: (data) => ({
        user: {
          name: data.user.name,
          credentials: {
            username: data.user.credentials.username,
          },
        },
        settings: data.settings,
      }),
    });

    const input = {
      user: {
        name: "John",
        credentials: {
          username: "john123",
          password: "secret",
        },
      },
      settings: {
        theme: "dark",
      },
    };

    const telemetry = config.schemaTelemetry.parse(input) as any;

    expect(telemetry).toEqual({
      user: {
        name: "John",
        credentials: {
          username: "john123",
        },
      },
      settings: {
        theme: "dark",
      },
    });
  });

  test("should exclude entire nested objects", () => {
    const schema = z.object({
      public: z.object({
        name: z.string(),
        age: z.number(),
      }),
      private: z.object({
        ssn: z.string(),
        bankAccount: z.string(),
      }),
    });

    const config = createConfig({
      schema,
      toTelemetryAttribute: (data) => ({
        public: data.public,
      }),
    });

    const input = {
      public: { name: "John", age: 30 },
      private: { ssn: "123-45-6789", bankAccount: "1234567890" },
    };

    const telemetry = config.schemaTelemetry.parse(input) as any;

    expect(telemetry).toEqual({
      public: { name: "John", age: 30 },
    });
  });

  test("should handle array field transformations", () => {
    const schema = z.object({
      users: z.array(
        z.object({
          name: z.string(),
          password: z.string(),
          email: z.string(),
        }),
      ),
    });

    const config = createConfig({
      schema,
      toTelemetryAttribute: (data) => ({
        users: data.users.map((user) => ({
          name: user.name,
          email: user.email,
        })),
      }),
    });

    const input = {
      users: [
        { name: "John", password: "pass1", email: "john@example.com" },
        { name: "Jane", password: "pass2", email: "jane@example.com" },
      ],
    };

    const telemetry = config.schemaTelemetry.parse(input) as any;

    expect(telemetry).toEqual({
      users: [
        { name: "John", email: "john@example.com" },
        { name: "Jane", email: "jane@example.com" },
      ],
    });
  });

  test("should handle multiple field exclusions", () => {
    const schema = z.object({
      name: z.string(),
      email: z.string(),
      password: z.string(),
      apiKey: z.string(),
      publicInfo: z.string(),
    });

    const config = createConfig({
      schema,
      toTelemetryAttribute: (data) => ({
        name: data.name,
        email: data.email,
        publicInfo: data.publicInfo,
      }),
    });

    const input = {
      name: "John",
      email: "john@example.com",
      password: "secret",
      apiKey: "key123",
      publicInfo: "visible",
    };

    const telemetry = config.schemaTelemetry.parse(input) as any;

    expect(telemetry).toEqual({
      name: "John",
      email: "john@example.com",
      publicInfo: "visible",
    });
  });

  test("should handle optional fields", () => {
    const schema = z.object({
      name: z.string(),
      password: z.string().optional(),
      age: z.number().optional(),
    });

    const config = createConfig({
      schema,
      toTelemetryAttribute: (data) => {
        const result: Record<string, unknown> = { name: data.name };
        if (data.age !== undefined) {
          result.age = data.age;
        }
        return result;
      },
    });

    const input1 = { name: "John", password: "secret", age: 30 };
    const telemetry1 = config.schemaTelemetry.parse(input1);
    expect(telemetry1).toEqual({ name: "John", age: 30 });

    const input2 = { name: "Jane" };
    const telemetry2 = config.schemaTelemetry.parse(input2);
    expect(telemetry2).toEqual({ name: "Jane" });
  });

  test("should handle deeply nested transformations", () => {
    const schema = z.object({
      level1: z.object({
        level2: z.object({
          level3: z.object({
            sensitive: z.string(),
            public: z.string(),
          }),
        }),
      }),
    });

    const config = createConfig({
      schema,
      toTelemetryAttribute: (data) => ({
        level1: {
          level2: {
            level3: {
              public: data.level1.level2.level3.public,
            },
          },
        },
      }),
    });

    const input = {
      level1: {
        level2: {
          level3: {
            sensitive: "secret",
            public: "visible",
          },
        },
      },
    };

    const telemetry = config.schemaTelemetry.parse(input) as any;

    expect(telemetry).toEqual({
      level1: {
        level2: {
          level3: {
            public: "visible",
          },
        },
      },
    });
  });

  test("should validate input before applying transformations", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const config = createConfig({
      schema,
      toTelemetryAttribute: (data) => ({
        name: data.name,
      }),
    });

    const invalidInput = { name: "John", age: "not a number" };

    expect(() => config.schemaTelemetry.parse(invalidInput)).toThrow();
  });

  test("should allow custom telemetry attributes", () => {
    const schema = z.object({
      firstName: z.string(),
      lastName: z.string(),
      age: z.number(),
    });

    const config = createConfig({
      schema,
      toTelemetryAttribute: (data) => ({
        fullName: `${data.firstName} ${data.lastName}`,
        isAdult: data.age >= 18,
      }),
    });

    const input = { firstName: "John", lastName: "Doe", age: 25 };
    const telemetry = config.schemaTelemetry.parse(input) as any;

    expect(telemetry).toEqual({
      fullName: "John Doe",
      isAdult: true,
    });
  });

  test("should handle computed telemetry values", () => {
    const schema = z.object({
      items: z.array(
        z.object({
          name: z.string(),
          price: z.number(),
          quantity: z.number(),
        }),
      ),
    });

    const config = createConfig({
      schema,
      toTelemetryAttribute: (data) => ({
        itemCount: data.items.length,
        totalValue: data.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      }),
    });

    const input = {
      items: [
        { name: "Apple", price: 1, quantity: 5 },
        { name: "Banana", price: 2, quantity: 3 },
      ],
    };

    const telemetry = config.schemaTelemetry.parse(input) as any;

    expect(telemetry).toEqual({
      itemCount: 2,
      totalValue: 11,
    });
  });
});

describe("createConfigUnion", () => {
  test("should create a discriminated union from multiple configs", () => {
    const config1 = createConfig({
      schema: z.object({
        type: z.literal("user"),
        name: z.string(),
        email: z.string(),
      }),
    });

    const config2 = createConfig({
      schema: z.object({
        type: z.literal("admin"),
        name: z.string(),
        permissions: z.array(z.string()),
      }),
    });

    const union = createConfigUnion("type", [config1, config2]);

    const userInput = { type: "user" as const, name: "John", email: "john@example.com" };
    const adminInput = { type: "admin" as const, name: "Jane", permissions: ["read", "write"] };

    expect(union.schema.parse(userInput)).toEqual(userInput);
    expect(union.schema.parse(adminInput)).toEqual(adminInput);
  });

  test("should reject invalid discriminator values", () => {
    const config1 = createConfig({
      schema: z.object({
        kind: z.literal("a"),
        value: z.string(),
      }),
    });

    const config2 = createConfig({
      schema: z.object({
        kind: z.literal("b"),
        value: z.number(),
      }),
    });

    const union = createConfigUnion("kind", [config1, config2]);

    const invalidInput = { kind: "c", value: "test" };

    expect(() => union.schema.parse(invalidInput)).toThrow();
  });

  test("should work with configs that have telemetry transformations", () => {
    const config1 = createConfig({
      schema: z.object({
        type: z.literal("public"),
        name: z.string(),
        secret: z.string(),
      }),
      toTelemetryAttribute: (data) => ({
        type: data.type,
        name: data.name,
      }),
    });

    const config2 = createConfig({
      schema: z.object({
        type: z.literal("private"),
        id: z.string(),
        password: z.string(),
      }),
      toTelemetryAttribute: (data) => ({
        type: data.type,
        id: data.id,
      }),
    });

    const union = createConfigUnion("type", [config1, config2]);

    const publicInput = { type: "public" as const, name: "Test", secret: "hidden" };
    const privateInput = { type: "private" as const, id: "123", password: "secret" };

    expect(union.schema.parse(publicInput)).toEqual(publicInput);
    expect(union.schema.parse(privateInput)).toEqual(privateInput);

    const telemetry1 = union.schemaTelemetry.parse(publicInput) as any;
    expect(telemetry1).toEqual({ type: "public", name: "Test" });

    const telemetry2 = union.schemaTelemetry.parse(privateInput) as any;
    expect(telemetry2).toEqual({ type: "private", id: "123" });
  });

  test("should handle multiple union options", () => {
    const configs = [
      createConfig({
        schema: z.object({
          animal: z.literal("dog"),
          bark: z.boolean(),
        }),
      }),
      createConfig({
        schema: z.object({
          animal: z.literal("cat"),
          meow: z.boolean(),
        }),
      }),
      createConfig({
        schema: z.object({
          animal: z.literal("bird"),
          fly: z.boolean(),
        }),
      }),
    ] as const;

    const union = createConfigUnion("animal", configs);

    expect(union.schema.parse({ animal: "dog", bark: true })).toEqual({
      animal: "dog",
      bark: true,
    });
    expect(union.schema.parse({ animal: "cat", meow: true })).toEqual({
      animal: "cat",
      meow: true,
    });
    expect(union.schema.parse({ animal: "bird", fly: true })).toEqual({
      animal: "bird",
      fly: true,
    });
  });

  test("should validate union member structure", () => {
    const config1 = createConfig({
      schema: z.object({
        mode: z.literal("simple"),
        value: z.string(),
      }),
    });

    const config2 = createConfig({
      schema: z.object({
        mode: z.literal("complex"),
        data: z.object({
          x: z.number(),
          y: z.number(),
        }),
      }),
    });

    const union = createConfigUnion("mode", [config1, config2]);

    const invalidSimple = { mode: "simple", value: 123 };
    const invalidComplex = { mode: "complex", data: { x: "not a number", y: 2 } };

    expect(() => union.schema.parse(invalidSimple)).toThrow();
    expect(() => union.schema.parse(invalidComplex)).toThrow();
  });

  test("should handle nested unions", () => {
    const innerConfig1 = createConfig({
      schema: z.object({
        subtype: z.literal("a"),
        aValue: z.string(),
      }),
    });

    const innerConfig2 = createConfig({
      schema: z.object({
        subtype: z.literal("b"),
        bValue: z.number(),
      }),
    });

    const innerUnion = createConfigUnion("subtype", [innerConfig1, innerConfig2]);

    const outerConfig = createConfig({
      schema: z.object({
        type: z.literal("nested"),
        inner: innerUnion.schema,
      }),
    });

    const parsed = outerConfig.schema.parse({
      type: "nested",
      inner: { subtype: "a", aValue: "test" },
    });

    expect(parsed).toEqual({
      type: "nested",
      inner: { subtype: "a", aValue: "test" },
    });
  });

  test("should apply telemetry transformations in union", () => {
    const config1 = createConfig({
      schema: z.object({
        type: z.literal("event"),
        timestamp: z.number(),
        userId: z.string(),
        eventData: z.object({
          action: z.string(),
          metadata: z.string(),
        }),
      }),
      toTelemetryAttribute: (data) => ({
        type: data.type,
        timestamp: data.timestamp,
        action: data.eventData.action,
      }),
    });

    const config2 = createConfig({
      schema: z.object({
        type: z.literal("error"),
        timestamp: z.number(),
        errorCode: z.string(),
        stackTrace: z.string(),
      }),
      toTelemetryAttribute: (data) => ({
        type: data.type,
        timestamp: data.timestamp,
        errorCode: data.errorCode,
      }),
    });

    const union = createConfigUnion("type", [config1, config2]);

    const eventInput = {
      type: "event" as const,
      timestamp: 1_234_567_890,
      userId: "user123",
      eventData: {
        action: "click",
        metadata: "button1",
      },
    };

    const errorInput = {
      type: "error" as const,
      timestamp: 1_234_567_891,
      errorCode: "ERR_500",
      stackTrace: "Error at line 42...",
    };

    const eventTelemetry = union.schemaTelemetry.parse(eventInput) as any;
    expect(eventTelemetry).toEqual({
      type: "event",
      timestamp: 1_234_567_890,
      action: "click",
    });

    const errorTelemetry = union.schemaTelemetry.parse(errorInput) as any;
    expect(errorTelemetry).toEqual({
      type: "error",
      timestamp: 1_234_567_891,
      errorCode: "ERR_500",
    });
  });
});
