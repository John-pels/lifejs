import { describe, expect, test } from "vitest";
import z from "zod";
import { zodObjectWithTelemetry, zodUnionWithTelemetry } from "./zod";

describe("zodObjectWithTelemetry", () => {
  test("should return an object with both schema and toTelemetry", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const object = zodObjectWithTelemetry({ schema });

    expect(object.schema).toBeDefined();
    expect(object.toTelemetry).toBeDefined();
    expect(typeof object.toTelemetry).toBe("function");
  });

  test("should return all data when no toTelemetry transformation is provided", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      email: z.string(),
    });

    const object = zodObjectWithTelemetry({ schema });
    const input = { name: "John", age: 30, email: "john@example.com" };

    const parsed = object.schema.parse(input);
    const telemetry = object.toTelemetry(input);

    expect(parsed).toEqual(input);
    expect(telemetry).toEqual(input);
  });

  test("should transform data using toTelemetry function", () => {
    const schema = z.object({
      name: z.string(),
      password: z.string(),
      email: z.string(),
    });

    const object = zodObjectWithTelemetry({
      schema,
      toTelemetry: (data) => ({
        name: data.name,
        email: data.email,
      }),
    });

    const input = { name: "John", password: "secret123", email: "john@example.com" };
    const telemetry = object.toTelemetry(input);

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

    const object = zodObjectWithTelemetry({
      schema,
      toTelemetry: (data) => ({
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

    const telemetry = object.toTelemetry(input);

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

    const object = zodObjectWithTelemetry({
      schema,
      toTelemetry: (data) => ({
        public: data.public,
      }),
    });

    const input = {
      public: { name: "John", age: 30 },
      private: { ssn: "123-45-6789", bankAccount: "1234567890" },
    };

    const telemetry = object.toTelemetry(input);

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

    const object = zodObjectWithTelemetry({
      schema,
      toTelemetry: (data) => ({
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

    const telemetry = object.toTelemetry(input);

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

    const object = zodObjectWithTelemetry({
      schema,
      toTelemetry: (data) => ({
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

    const telemetry = object.toTelemetry(input);

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

    const object = zodObjectWithTelemetry({
      schema,
      toTelemetry: (data) => {
        const result: Record<string, unknown> = { name: data.name };
        if (data.age !== undefined) {
          result.age = data.age;
        }
        return result;
      },
    });

    const input1 = { name: "John", password: "secret", age: 30 };
    const telemetry1 = object.toTelemetry(input1);
    expect(telemetry1).toEqual({ name: "John", age: 30 });

    const input2 = { name: "Jane" };
    const telemetry2 = object.toTelemetry(input2);
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

    const object = zodObjectWithTelemetry({
      schema,
      toTelemetry: (data) => ({
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

    const telemetry = object.toTelemetry(input);

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

  test("should allow custom telemetry attributes", () => {
    const schema = z.object({
      firstName: z.string(),
      lastName: z.string(),
      age: z.number(),
    });

    const object = zodObjectWithTelemetry({
      schema,
      toTelemetry: (data) => ({
        fullName: `${data.firstName} ${data.lastName}`,
        isAdult: data.age >= 18,
      }),
    });

    const input = { firstName: "John", lastName: "Doe", age: 25 };
    const telemetry = object.toTelemetry(input);

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

    const object = zodObjectWithTelemetry({
      schema,
      toTelemetry: (data) => ({
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

    const telemetry = object.toTelemetry(input);

    expect(telemetry).toEqual({
      itemCount: 2,
      totalValue: 11,
    });
  });

  test("should handle empty objects", () => {
    const schema = z.object({});
    const object = zodObjectWithTelemetry({ schema });

    const telemetry = object.toTelemetry({});
    expect(telemetry).toEqual({});
  });

  test("should handle complex union types within schema", () => {
    const schema = z.object({
      value: z.union([z.string(), z.number(), z.boolean()]),
    });

    const object = zodObjectWithTelemetry({ schema });

    expect(object.toTelemetry({ value: "test" })).toEqual({ value: "test" });
    expect(object.toTelemetry({ value: 42 })).toEqual({ value: 42 });
    expect(object.toTelemetry({ value: true })).toEqual({ value: true });
  });

  test("should handle array of primitives", () => {
    const schema = z.object({
      tags: z.array(z.string()),
      scores: z.array(z.number()),
    });

    const object = zodObjectWithTelemetry({
      schema,
      toTelemetry: (data) => ({
        tagCount: data.tags.length,
        averageScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
      }),
    });

    const input = {
      tags: ["javascript", "typescript", "node"],
      scores: [85, 90, 78],
    };

    const telemetry = object.toTelemetry(input);

    expect(telemetry).toEqual({
      tagCount: 3,
      averageScore: 84.333_333_333_333_33,
    });
  });

  test("should preserve data types in transformation", () => {
    const schema = z.object({
      text: z.string(),
      number: z.number(),
      bool: z.boolean(),
      date: z.date(),
      array: z.array(z.string()),
    });

    const testDate = new Date("2024-01-01");
    const object = zodObjectWithTelemetry({ schema });
    const input = {
      text: "hello",
      number: 42,
      bool: true,
      date: testDate,
      array: ["a", "b"],
    };

    const telemetry = object.toTelemetry(input);

    expect(telemetry).toEqual(input);
    expect(telemetry.date).toBeInstanceOf(Date);
  });
});

describe("zodUnionWithTelemetry", () => {
  test("should create a discriminated union from multiple objects", () => {
    const object1 = zodObjectWithTelemetry({
      schema: z.object({
        type: z.literal("user"),
        name: z.string(),
        email: z.string(),
      }),
    });

    const object2 = zodObjectWithTelemetry({
      schema: z.object({
        type: z.literal("admin"),
        name: z.string(),
        permissions: z.array(z.string()),
      }),
    });

    const union = zodUnionWithTelemetry("type", [object1, object2]);

    const userInput = { type: "user" as const, name: "John", email: "john@example.com" };
    const adminInput = { type: "admin" as const, name: "Jane", permissions: ["read", "write"] };

    expect(union.schema.parse(userInput)).toEqual(userInput);
    expect(union.schema.parse(adminInput)).toEqual(adminInput);
  });

  test("should have toTelemetry function", () => {
    const object1 = zodObjectWithTelemetry({
      schema: z.object({
        type: z.literal("a"),
        value: z.string(),
      }),
    });

    const union = zodUnionWithTelemetry("type", [object1]);

    expect(union.toTelemetry).toBeDefined();
    expect(typeof union.toTelemetry).toBe("function");
  });

  test("should reject invalid discriminator values", () => {
    const object1 = zodObjectWithTelemetry({
      schema: z.object({
        kind: z.literal("a"),
        value: z.string(),
      }),
    });

    const object2 = zodObjectWithTelemetry({
      schema: z.object({
        kind: z.literal("b"),
        value: z.number(),
      }),
    });

    const union = zodUnionWithTelemetry("kind", [object1, object2]);

    const invalidInput = { kind: "c", value: "test" };

    expect(() => union.schema.parse(invalidInput)).toThrow();
  });

  test("should work with objects that have telemetry transformations", () => {
    const object1 = zodObjectWithTelemetry({
      schema: z.object({
        type: z.literal("public"),
        name: z.string(),
        secret: z.string(),
      }),
      toTelemetry: (data) => ({
        type: data.type,
        name: data.name,
      }),
    });

    const object2 = zodObjectWithTelemetry({
      schema: z.object({
        type: z.literal("private"),
        id: z.string(),
        password: z.string(),
      }),
      toTelemetry: (data) => ({
        type: data.type,
        id: data.id,
      }),
    });

    const union = zodUnionWithTelemetry("type", [object1, object2]);

    const publicInput = { type: "public" as const, name: "Test", secret: "hidden" };
    const privateInput = { type: "private" as const, id: "123", password: "secret" };

    expect(union.schema.parse(publicInput)).toEqual(publicInput);
    expect(union.schema.parse(privateInput)).toEqual(privateInput);

    const telemetry1 = union.toTelemetry(publicInput);
    expect(telemetry1).toEqual({ type: "public", name: "Test" });

    const telemetry2 = union.toTelemetry(privateInput);
    expect(telemetry2).toEqual({ type: "private", id: "123" });
  });

  test("should handle multiple union options", () => {
    const objects = [
      zodObjectWithTelemetry({
        schema: z.object({
          animal: z.literal("dog"),
          bark: z.boolean(),
        }),
      }),
      zodObjectWithTelemetry({
        schema: z.object({
          animal: z.literal("cat"),
          meow: z.boolean(),
        }),
      }),
      zodObjectWithTelemetry({
        schema: z.object({
          animal: z.literal("bird"),
          fly: z.boolean(),
        }),
      }),
    ] as const;

    const union = zodUnionWithTelemetry("animal", objects);

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
    const object1 = zodObjectWithTelemetry({
      schema: z.object({
        mode: z.literal("simple"),
        value: z.string(),
      }),
    });

    const object2 = zodObjectWithTelemetry({
      schema: z.object({
        mode: z.literal("complex"),
        data: z.object({
          x: z.number(),
          y: z.number(),
        }),
      }),
    });

    const union = zodUnionWithTelemetry("mode", [object1, object2]);

    const invalidSimple = { mode: "simple", value: 123 };
    const invalidComplex = { mode: "complex", data: { x: "not a number", y: 2 } };

    expect(() => union.schema.parse(invalidSimple)).toThrow();
    expect(() => union.schema.parse(invalidComplex)).toThrow();
  });

  test("should handle nested unions", () => {
    const innerObject1 = zodObjectWithTelemetry({
      schema: z.object({
        subtype: z.literal("a"),
        aValue: z.string(),
      }),
    });

    const innerObject2 = zodObjectWithTelemetry({
      schema: z.object({
        subtype: z.literal("b"),
        bValue: z.number(),
      }),
    });

    const innerUnion = zodUnionWithTelemetry("subtype", [innerObject1, innerObject2]);

    const outerObject = zodObjectWithTelemetry({
      schema: z.object({
        type: z.literal("nested"),
        inner: innerUnion.schema,
      }),
    });

    const parsed = outerObject.schema.parse({
      type: "nested",
      inner: { subtype: "a", aValue: "test" },
    });

    expect(parsed).toEqual({
      type: "nested",
      inner: { subtype: "a", aValue: "test" },
    });
  });

  test("should apply telemetry transformations in union", () => {
    const object1 = zodObjectWithTelemetry({
      schema: z.object({
        type: z.literal("event"),
        timestamp: z.number(),
        userId: z.string(),
        eventData: z.object({
          action: z.string(),
          metadata: z.string(),
        }),
      }),
      toTelemetry: (data) => ({
        type: data.type,
        timestamp: data.timestamp,
        action: data.eventData.action,
      }),
    });

    const object2 = zodObjectWithTelemetry({
      schema: z.object({
        type: z.literal("error"),
        timestamp: z.number(),
        errorCode: z.string(),
        stackTrace: z.string(),
      }),
      toTelemetry: (data) => ({
        type: data.type,
        timestamp: data.timestamp,
        errorCode: data.errorCode,
      }),
    });

    const union = zodUnionWithTelemetry("type", [object1, object2]);

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

    const eventTelemetry = union.toTelemetry(eventInput);
    expect(eventTelemetry).toEqual({
      type: "event",
      timestamp: 1_234_567_890,
      action: "click",
    });

    const errorTelemetry = union.toTelemetry(errorInput);
    expect(errorTelemetry).toEqual({
      type: "error",
      timestamp: 1_234_567_891,
      errorCode: "ERR_500",
    });
  });

  test("should return full data when no transformation specified in union", () => {
    const object1 = zodObjectWithTelemetry({
      schema: z.object({
        type: z.literal("x"),
        data: z.string(),
      }),
    });

    const object2 = zodObjectWithTelemetry({
      schema: z.object({
        type: z.literal("y"),
        info: z.number(),
      }),
    });

    const union = zodUnionWithTelemetry("type", [object1, object2]);

    const input1 = { type: "x" as const, data: "test" };
    const input2 = { type: "y" as const, info: 42 };

    expect(union.toTelemetry(input1)).toEqual(input1);
    expect(union.toTelemetry(input2)).toEqual(input2);
  });

  test("should apply toTelemetry from matching union member", () => {
    const object1 = zodObjectWithTelemetry({
      schema: z.object({
        kind: z.literal("specific"),
        value: z.string(),
      }),
      toTelemetry: (data) => ({ kind: data.kind }),
    });

    const union = zodUnionWithTelemetry("kind", [object1]);

    const validInput = { kind: "specific" as const, value: "test" };
    expect(union.toTelemetry(validInput)).toEqual({ kind: "specific" });
  });

  test("should handle complex nested transformations in union members", () => {
    const object1 = zodObjectWithTelemetry({
      schema: z.object({
        provider: z.literal("openai"),
        apiKey: z.string(),
        model: z.string(),
        options: z.object({
          temperature: z.number(),
          maxTokens: z.number(),
        }),
      }),
      toTelemetry: (data) => ({
        provider: data.provider,
        model: data.model,
        temperature: data.options.temperature,
      }),
    });

    const object2 = zodObjectWithTelemetry({
      schema: z.object({
        provider: z.literal("anthropic"),
        token: z.string(),
        version: z.string(),
        settings: z.object({
          stream: z.boolean(),
        }),
      }),
      toTelemetry: (data) => ({
        provider: data.provider,
        version: data.version,
        stream: data.settings.stream,
      }),
    });

    const union = zodUnionWithTelemetry("provider", [object1, object2]);

    const openaiInput = {
      provider: "openai" as const,
      apiKey: "sk-secret",
      model: "gpt-4",
      options: { temperature: 0.7, maxTokens: 100 },
    };

    const anthropicInput = {
      provider: "anthropic" as const,
      token: "secret-token",
      version: "2023-01-01",
      settings: { stream: true },
    };

    expect(union.toTelemetry(openaiInput)).toEqual({
      provider: "openai",
      model: "gpt-4",
      temperature: 0.7,
    });

    expect(union.toTelemetry(anthropicInput)).toEqual({
      provider: "anthropic",
      version: "2023-01-01",
      stream: true,
    });
  });

  test("should handle union with partial data gracefully", () => {
    const object1 = zodObjectWithTelemetry({
      schema: z.object({
        type: z.literal("full"),
        required: z.string(),
        optional: z.string().optional(),
      }),
      toTelemetry: (data) => ({
        type: data.type,
        hasOptional: data.optional !== undefined,
      }),
    });

    const union = zodUnionWithTelemetry("type", [object1]);

    const withOptional = { type: "full" as const, required: "test", optional: "value" };
    const withoutOptional = { type: "full" as const, required: "test" };

    expect(union.toTelemetry(withOptional)).toEqual({
      type: "full",
      hasOptional: true,
    });

    expect(union.toTelemetry(withoutOptional)).toEqual({
      type: "full",
      hasOptional: false,
    });
  });
});
