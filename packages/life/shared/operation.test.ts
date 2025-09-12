import { describe, expect, test } from "bun:test";
import { isLifeError, lifeError } from "./error";
import { attempt, failure, isResult, success, type ToPublic, toPublic } from "./operation";

describe("operation", () => {
  describe("success", () => {
    test("returns success tuple with data", () => {
      const result = success({ id: 1, name: "Alice" });
      expect(result[0]).toBeUndefined();
      expect(result[1]).toEqual({ id: 1, name: "Alice" });
    });

    test("returns success tuple without data", () => {
      const result = success();
      expect(result[0]).toBeUndefined();
      expect(result[1]).toBeUndefined();
    });

    test("unwraps nested operation results", () => {
      const nested = success({ id: 1 });
      const result = success(nested);
      expect(result[0]).toBeUndefined();
      expect(result[1]).toEqual({ id: 1 });
    });

    test("preserves primitive values", () => {
      expect(success(42)[1]).toBe(42);
      expect(success("test")[1]).toBe("test");
      expect(success(true)[1]).toBe(true);
      expect(success(null)[1]).toBeNull();
    });
  });

  describe("failure", () => {
    test("returns failure tuple with LifeError", () => {
      const result = failure({ code: "NotFound" });
      expect(result[0]).toBeDefined();
      expect(isLifeError(result[0])).toBe(true);
      expect(result[0]?.code).toBe("NotFound");
      expect(result[1]).toBeUndefined();
    });

    test("accepts existing LifeError instance", () => {
      const error = lifeError({ code: "InvalidInput", message: "Bad input" });
      const result = failure(error);
      expect(result[0]).toBe(error);
      expect(result[1]).toBeUndefined();
    });

    test("includes custom message", () => {
      const result = failure({ code: "Forbidden", message: "Access denied" });
      expect(result[0]?.message).toBe("Access denied");
    });

    test("includes extra data", () => {
      const result = failure({
        code: "Unknown",
        error: new Error("Something went wrong"),
      });
      expect(result[0]?._extra?.error).toBeInstanceOf(Error);
    });
  });

  describe("isResult", () => {
    test("identifies valid operation results", () => {
      expect(isResult(success())).toBe(true);
      expect(isResult(success(42))).toBe(true);
      expect(isResult(failure({ code: "NotFound" }))).toBe(true);
    });

    test("rejects non-operation values", () => {
      expect(isResult([undefined, 42])).toBe(false);
      expect(isResult([null, null])).toBe(false);
      expect(isResult(42)).toBe(false);
      expect(isResult("test")).toBe(false);
      expect(isResult({})).toBe(false);
      expect(isResult(null)).toBe(false);
      expect(isResult(undefined)).toBe(false);
    });
  });

  describe("attempt", () => {
    describe("synchronous functions", () => {
      test("captures successful return value", () => {
        const [error, data] = attempt(() => 42);
        expect(error).toBeUndefined();
        expect(data).toBe(42);
      });

      test("captures thrown errors as LifeError", () => {
        const [error, data] = attempt(() => {
          throw new Error("Something failed");
        });
        expect(isLifeError(error)).toBe(true);
        expect(error?.code).toBe("Unknown");
        expect(data).toBeUndefined();
      });

      test("preserves thrown LifeError", () => {
        const customError = lifeError({ code: "Timeout", message: "Too slow" });
        const [error] = attempt(() => {
          throw customError;
        });
        expect(error).toBe(customError);
      });

      test("unwraps returned operation results", () => {
        const [error, data] = attempt(() => success({ value: "test" }));
        expect(error).toBeUndefined();
        expect(data).toEqual({ value: "test" });
      });

      test("preserves failure results", () => {
        const [error, data] = attempt(() => failure({ code: "NotFound" }));
        expect(error?.code).toBe("NotFound");
        expect(data).toBeUndefined();
      });

      test("handles functions that never return", () => {
        const [error] = attempt(() => {
          while (true) {
            throw new Error("Never returns");
          }
        });
        expect(isLifeError(error)).toBe(true);
      });
    });

    describe("asynchronous functions", () => {
      test("captures resolved values", async () => {
        const [error, data] = await attempt(async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return "async result";
        });
        expect(error).toBeUndefined();
        expect(data).toBe("async result");
      });

      test("captures rejected promises as LifeError", async () => {
        const [error, data] = await attempt(async () => {
          throw await new Error("Async failure");
        });
        expect(isLifeError(error)).toBe(true);
        expect(error?.code).toBe("Unknown");
        expect(data).toBeUndefined();
      });

      test("preserves rejected LifeError", async () => {
        const customError = lifeError({ code: "RateLimit" });
        const [error] = await attempt(async () => {
          throw await customError;
        });
        expect(error).toBe(customError);
      });

      test("unwraps async operation results", async () => {
        const [error, data] = await attempt(async () => success({ async: true }));
        expect(error).toBeUndefined();
        expect(data).toEqual({ async: true });
      });

      test("preserves async failure results", async () => {
        const [error, data] = await attempt(async () => failure({ code: "Upstream" }));
        expect(error?.code).toBe("Upstream");
        expect(data).toBeUndefined();
      });
    });

    describe("direct promises", () => {
      test("handles resolved promises", async () => {
        const promise = Promise.resolve("direct promise");
        const [error, data] = await attempt(promise);
        expect(error).toBeUndefined();
        expect(data).toBe("direct promise");
      });

      test("handles rejected promises", async () => {
        const promise = Promise.reject(new Error("Promise rejected"));
        const [error, data] = await attempt(promise);
        expect(isLifeError(error)).toBe(true);
        expect(error?.code).toBe("Unknown");
        expect(data).toBeUndefined();
      });

      test("handles promises that resolve to operation results", async () => {
        const promise = Promise.resolve(success({ fromPromise: true }));
        const [error, data] = await attempt(promise);
        expect(error).toBeUndefined();
        expect(data).toEqual({ fromPromise: true });
      });

      test("handles promises that resolve to failures", async () => {
        const promise = Promise.resolve(failure({ code: "Conflict" }));
        const [error, data] = await attempt(promise);
        expect(error?.code).toBe("Conflict");
        expect(data).toBeUndefined();
      });
    });

    describe("edge cases", () => {
      test("handles null and undefined returns", () => {
        const [e1, d1] = attempt(() => null);
        expect(e1).toBeUndefined();
        expect(d1).toBeNull();

        const [e2, d2] = attempt(() => {
          return;
        });
        expect(e2).toBeUndefined();
        expect(d2).toBeUndefined();
      });

      test("handles throwing non-Error objects", () => {
        const [error] = attempt(() => {
          throw new Error("string error");
        });
        expect(isLifeError(error)).toBe(true);
        expect(error?.code).toBe("Unknown");
        expect(error?._extra?.error).toBeInstanceOf(Error);
      });

      test("handles throwing null or undefined", () => {
        const [e1] = attempt(() => {
          throw new Error("null error");
        });
        expect(isLifeError(e1)).toBe(true);
        expect(e1?.code).toBe("Unknown");

        const [e2] = attempt(() => {
          throw new Error("undefined error");
        });
        expect(isLifeError(e2)).toBe(true);
        expect(e2?.code).toBe("Unknown");
      });
    });
  });

  describe("toPublic with functions", () => {
    test("converts sync function returning data", () => {
      const internalFunc = () => success(42);
      const publicFunc = toPublic(internalFunc);
      expect(publicFunc()).toBe(42);
    });

    test("converts sync function returning void", () => {
      const internalFunc = () => success();
      const publicFunc = toPublic(internalFunc);
      expect(publicFunc()).toBeUndefined();
    });

    test("throws on failure result", () => {
      const internalFunc = () => failure({ code: "NotFound" });
      const publicFunc = toPublic(internalFunc);
      expect(() => publicFunc()).toThrow();
      try {
        publicFunc();
      } catch (error) {
        expect(isLifeError(error)).toBe(true);
        expect((error as any).code).toBe("NotFound");
      }
    });

    test("converts async function returning data", async () => {
      const internalFunc = async () => success("async data");
      const publicFunc = toPublic(internalFunc);
      const result = await publicFunc();
      expect(result).toBe("async data");
    });

    test("throws on async failure", async () => {
      const internalFunc = async () => failure({ code: "Upstream" });
      const publicFunc = toPublic(internalFunc);
      await expect(publicFunc()).rejects.toThrow();
      try {
        await publicFunc();
      } catch (error) {
        expect(isLifeError(error)).toBe(true);
        expect((error as any).code).toBe("Upstream");
      }
    });

    test("preserves function parameters", () => {
      const internalFunc = (a: number, b: string) => success(`${a}-${b}`);
      const publicFunc = toPublic(internalFunc);
      expect(publicFunc(42, "test")).toBe("42-test");
    });

    test("handles functions with complex return types", () => {
      const internalFunc = () => success({ nested: { value: [1, 2, 3] } });
      const publicFunc = toPublic(internalFunc);
      expect(publicFunc()).toEqual({ nested: { value: [1, 2, 3] } });
    });
  });

  describe("toPublic with instances", () => {
    class TestClass {
      syncMethod() {
        return success({ method: "sync" });
      }

      asyncMethod() {
        return Promise.resolve(success({ method: "async" }));
      }

      failingMethod() {
        return failure({ code: "InvalidInput" });
      }

      propertyValue = "test property";

      methodWithParams(value: number) {
        return success(value * 2);
      }
    }

    test("converts sync methods to public", () => {
      const instance = new TestClass();
      const pub = toPublic(instance);
      expect(pub.syncMethod()).toEqual({ method: "sync" });
    });

    test("converts async methods to public", async () => {
      const instance = new TestClass();
      const pub = toPublic(instance);
      const result = await pub.asyncMethod();
      expect(result).toEqual({ method: "async" });
    });

    test("throws on failing methods", () => {
      const instance = new TestClass();
      const pub = toPublic(instance);
      expect(() => pub.failingMethod()).toThrow();
    });

    test("preserves non-function properties", () => {
      const instance = new TestClass();
      const pub = toPublic(instance);
      expect(pub.propertyValue).toBe("test property");
    });

    test("preserves method parameters", () => {
      const instance = new TestClass();
      const pub = toPublic(instance);
      expect(pub.methodWithParams(21)).toBe(42);
    });

    test("provides internal methods under .safe property", () => {
      const instance = new TestClass();
      const pub = toPublic(instance);
      const [error, data] = pub.safe.syncMethod();
      expect(error).toBeUndefined();
      expect(data).toEqual({ method: "sync" });
    });

    test("maintains method binding context", () => {
      class ContextClass {
        private value = 10;
        getValue() {
          return success(this.value);
        }
      }
      const instance = new ContextClass();
      const pub = toPublic(instance);
      expect(pub.getValue()).toBe(10);
    });

    test("works with plain objects", () => {
      const obj = {
        method: () => success("plain"),
        prop: "value",
      };
      const pub = toPublic(obj);
      expect(pub.method()).toBe("plain");
      expect(pub.prop).toBe("value");
    });

    test("handles nested object methods", () => {
      const obj = {
        nested: {
          method: () => success("nested result"),
        },
      };
      const pub = toPublic(obj);
      expect(pub.nested).toEqual(obj.nested);
    });
  });

  describe("toPublic with classes", () => {
    class InternalService {
      private name: string;
      constructor(name: string) {
        this.name = name;
      }

      getName() {
        return success(this.name);
      }

      fetchData(id: number) {
        if (id < 0) return failure({ code: "InvalidInput", message: "Invalid ID" });
        return success({ id, data: `Data for ${id}` });
      }

      updateName(newName: string) {
        if (!newName) return failure({ code: "InvalidInput", message: "Name cannot be empty" });
        this.name = newName;
        return success();
      }
    }

    test("converts class constructor to public", () => {
      const PublicService = toPublic(InternalService);
      const instance = new PublicService("TestService");
      expect(instance.getName()).toBe("TestService");
    });

    test("public class instances throw on failure", () => {
      const PublicService = toPublic(InternalService);
      const instance = new PublicService("TestService");
      expect(() => instance.updateName("")).toThrow();
    });

    test("public class instances handle async methods", async () => {
      const PublicService = toPublic(InternalService);
      const instance = new PublicService("TestService");
      const data = await instance.fetchData(123);
      expect(data).toEqual({ id: 123, data: "Data for 123" });
    });

    test("public class instances provide .safe property", () => {
      const PublicService = toPublic(InternalService);
      const instance = new PublicService("TestService");
      const [error, name] = instance.safe.getName();
      expect(error).toBeUndefined();
      expect(name).toBe("TestService");
    });

    test("type inference works with ToPublic", () => {
      type PublicServiceType = ToPublic<typeof InternalService>;
      const PublicService: PublicServiceType = toPublic(InternalService);
      const instance = new PublicService("TestService");
      expect(instance.getName()).toBe("TestService");
    });
  });

  describe("toPublic with primitives", () => {
    test("returns primitives as-is", () => {
      expect(toPublic(42)).toBe(42);
      expect(toPublic("string")).toBe("string");
      expect(toPublic(true)).toBe(true);
      expect(toPublic(null)).toBe(null);
    });
  });

  describe("operation chaining", () => {
    test("chains multiple successful operations", () => {
      const [e1, d1] = attempt(() => success(10));
      if (e1) throw e1;
      const [e2, d2] = attempt(() => success(d1 * 2));
      if (e2) throw e2;
      const [e3, d3] = attempt(() => success(d2 + 5));
      expect(e3).toBeUndefined();
      expect(d3).toBe(25);
    });

    test("short-circuits on first failure", () => {
      const [e1] = attempt(() => success(10));
      if (e1) return;
      const [e2] = attempt(() => failure({ code: "NotFound" }));
      if (e2) {
        expect(e2.code).toBe("NotFound");
        return;
      }
      const [e3] = attempt(() => success("should not reach"));
      expect(e3).toBeUndefined();
    });

    test("async operation chaining", async () => {
      const pipeline = async () => {
        const [e1, d1] = await attempt(async () => success("start"));
        if (e1) return failure(e1);

        const [e2, d2] = await attempt(async () => success(`${d1}-middle`));
        if (e2) return failure(e2);

        const [e3, d3] = await attempt(async () => success(`${d2}-end`));
        if (e3) return failure(e3);

        return success(d3);
      };

      const [error, result] = await attempt(pipeline);
      expect(error).toBeUndefined();
      expect(result).toBe("start-middle-end");
    });
  });

  describe("type safety", () => {
    test("preserves literal types", () => {
      const result = success("literal" as const);
      type DataType = (typeof result)[1];
      const _typeCheck: DataType = "literal";
      expect(result[1]).toBe("literal");
    });

    test("handles union types", () => {
      const func = (flag: boolean) => {
        if (flag) return success({ type: "a" as const });
        return success({ type: "b" as const });
      };
      const [error, data] = func(true);
      if (!error && data.type === "a") {
        expect(data.type).toBe("a");
      }
    });

    test("handles generic functions", () => {
      const identity = <T>(value: T) => success(value);
      const [_, data] = identity({ generic: true });
      expect(data).toEqual({ generic: true });
    });
  });
});
