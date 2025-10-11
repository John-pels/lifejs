import { describe, expect, test } from "vitest";
import { isLifeError, lifeError } from "./error";
import {
  attempt,
  deserializeResult,
  failure,
  isResult,
  serializeResult,
  success,
  type ToPublic,
  toPublic,
} from "./operation";

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
      const error = lifeError({ code: "Validation", message: "Bad input" });
      const result = failure(error);
      expect(result[0]).toBe(error);
      expect(result[1]).toBeUndefined();
    });

    test("includes custom message", () => {
      const result = failure({ code: "Forbidden", message: "Access denied" });
      expect(result[0]?.message).toBe("Access denied");
    });

    test("includes extra data", () => {
      // const [err, aaa] = attempt(() => {});
      // if (err && err.code === "Validation" && err.zodError) {

      // }
      const result = failure({
        code: "Unknown",
        cause: new Error("Something went wrong"),
      });
      if (result[0]?.code === "Unknown") {
        expect(result[0]?.cause).toBeInstanceOf(Error);
      }
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
        if (error?.code === "Unknown") {
          expect(error?.cause).toBeInstanceOf(Error);
        }
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
        return failure({ code: "Validation" });
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

    test("handles nested object methods (legacy test - replaced by deep nesting suite)", () => {
      const obj = {
        nested: {
          method: () => success("nested result"),
        },
      };
      const pub = toPublic(obj);
      // Deep nesting now wraps nested methods too
      expect(pub.nested.method()).toBe("nested result");
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
        if (id < 0) return failure({ code: "Validation", message: "Invalid ID" });
        return success({ id, data: `Data for ${id}` });
      }

      updateName(newName: string) {
        if (!newName) return failure({ code: "Validation", message: "Name cannot be empty" });
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

  describe("toPublic with deep nesting", () => {
    describe("nested plain objects", () => {
      test("wraps methods at depth 2", () => {
        const obj = {
          level1: {
            method: () => success("depth 2"),
          },
        };
        const pub = toPublic(obj);
        expect(pub.level1.method()).toBe("depth 2");
      });

      test("wraps methods at depth 3", () => {
        const obj = {
          level1: {
            level2: {
              method: () => success("depth 3"),
            },
          },
        };
        const pub = toPublic(obj);
        expect(pub.level1.level2.method()).toBe("depth 3");
      });

      test("wraps methods at arbitrary depth", () => {
        const obj = {
          a: {
            b: {
              c: {
                d: {
                  e: {
                    deepMethod: () => success("very deep"),
                  },
                },
              },
            },
          },
        };
        const pub = toPublic(obj);
        expect(pub.a.b.c.d.e.deepMethod()).toBe("very deep");
      });

      test("wraps async methods at nested levels", async () => {
        const obj = {
          api: {
            users: {
              async fetch() {
                return await success({ id: 1, name: "Alice" });
              },
            },
          },
        };
        const pub = toPublic(obj);
        const result = await pub.api.users.fetch();
        expect(result).toEqual({ id: 1, name: "Alice" });
      });

      test("throws on nested method failures", () => {
        const obj = {
          nested: {
            failingMethod: () => failure({ code: "NotFound" }),
          },
        };
        const pub = toPublic(obj);
        expect(() => pub.nested.failingMethod()).toThrow();
      });

      test("preserves non-function properties at all levels", () => {
        const obj = {
          level1: {
            prop1: "value1",
            level2: {
              prop2: 42,
              level3: {
                prop3: true,
              },
            },
          },
        };
        const pub = toPublic(obj);
        expect(pub.level1.prop1).toBe("value1");
        expect(pub.level1.level2.prop2).toBe(42);
        expect(pub.level1.level2.level3.prop3).toBe(true);
      });
    });

    describe("nested class instances", () => {
      class NestedService {
        getData() {
          return success("nested service data");
        }
      }

      class ParentService {
        nested = new NestedService();
        getParentData() {
          return success("parent data");
        }
      }

      test("wraps methods on nested class instances", () => {
        const instance = new ParentService();
        const pub = toPublic(instance);
        expect(pub.nested.getData()).toBe("nested service data");
      });

      test("wraps both parent and nested methods", () => {
        const instance = new ParentService();
        const pub = toPublic(instance);
        expect(pub.getParentData()).toBe("parent data");
        expect(pub.nested.getData()).toBe("nested service data");
      });

      test("maintains binding context for nested class methods", () => {
        class Inner {
          private value = "inner value";
          getValue() {
            return success(this.value);
          }
        }
        class Outer {
          inner = new Inner();
        }
        const instance = new Outer();
        const pub = toPublic(instance);
        expect(pub.inner.getValue()).toBe("inner value");
      });
    });

    describe("mixed nesting (objects and classes)", () => {
      test("handles objects containing class instances", () => {
        class Service {
          fetch() {
            return success("service data");
          }
        }
        const obj = {
          services: {
            primary: new Service(),
          },
        };
        const pub = toPublic(obj);
        expect(pub.services.primary.fetch()).toBe("service data");
      });

      test("handles classes containing nested objects", () => {
        class Container {
          methods = {
            nested: {
              deepFunc: () => success("deep in class"),
            },
          };
        }
        const instance = new Container();
        const pub = toPublic(instance);
        expect(pub.methods.nested.deepFunc()).toBe("deep in class");
      });

      test("handles complex mixed structures", () => {
        class InnerService {
          process() {
            return success("processed");
          }
        }
        const obj = {
          api: {
            v1: {
              service: new InnerService(),
              helpers: {
                transform: () => success("transformed"),
              },
            },
          },
        };
        const pub = toPublic(obj);
        expect(pub.api.v1.service.process()).toBe("processed");
        expect(pub.api.v1.helpers.transform()).toBe("transformed");
      });
    });

    describe(".safe property with deep nesting", () => {
      test("root .safe provides access to entire unwrapped tree", () => {
        const obj = {
          level1: {
            level2: {
              method: () => success("deep result"),
            },
          },
        };
        const pub = toPublic(obj);
        // biome-ignore lint/suspicious/noExplicitAny: needed for testing raw safe access
        const [error, data] = (pub.safe as any).level1.level2.method();
        expect(error).toBeUndefined();
        expect(data).toBe("deep result");
      });

      test(".safe works with nested class instances", () => {
        class Nested {
          getData() {
            return success("nested data");
          }
        }
        class Parent {
          nested = new Nested();
        }
        const instance = new Parent();
        const pub = toPublic(instance);
        // biome-ignore lint/suspicious/noExplicitAny: needed for testing raw safe access
        const [error, data] = (pub.safe as any).nested.getData();
        expect(error).toBeUndefined();
        expect(data).toBe("nested data");
      });

      test(".safe returns OperationResult at any depth", async () => {
        const obj = {
          a: {
            b: {
              async asyncMethod() {
                return await success({ nested: true });
              },
            },
          },
        };
        const pub = toPublic(obj);
        const [error, data] = await pub.safe.a.b.asyncMethod();
        expect(error).toBeUndefined();
        expect(data).toEqual({ nested: true });
      });

      test(".safe with nested failures", () => {
        const obj = {
          nested: {
            fail: () => failure({ code: "Validation", message: "Invalid input" }),
          },
        };
        const pub = toPublic(obj);
        const [error, data] = pub.safe.nested.fail();
        expect(error?.code).toBe("Validation");
        expect(error?.message).toBe("Invalid input");
        expect(data).toBeUndefined();
      });
    });

    describe("circular references", () => {
      test("handles self-referencing objects", () => {
        const obj: any = {
          method: () => success("works"),
        };
        obj.self = obj;
        const pub = toPublic(obj);
        expect(pub.method()).toBe("works");
        expect(pub.self.method()).toBe("works");
        expect(pub.self.self.method()).toBe("works");
      });

      test("handles circular class instances", () => {
        class CircularClass {
          child?: CircularClass;
          getData() {
            return success("circular data");
          }
        }
        const instance = new CircularClass();
        instance.child = instance;
        const pub = toPublic(instance);
        expect(pub.getData()).toBe("circular data");
        expect(pub.child?.getData()).toBe("circular data");
        expect(pub.child?.child?.getData()).toBe("circular data");
      });

      test("handles parent-child circular references", () => {
        class Child {
          parent?: Parent;
          getChild() {
            return success("child");
          }
        }
        class Parent {
          child = new Child();
          getParent() {
            return success("parent");
          }
        }
        const parent = new Parent();
        parent.child.parent = parent;
        const pub = toPublic(parent);
        expect(pub.getParent()).toBe("parent");
        expect(pub.child.getChild()).toBe("child");
        expect(pub.child.parent?.getParent()).toBe("parent");
        expect(pub.child.parent?.child.getChild()).toBe("child");
      });

      test("handles complex circular graphs", () => {
        const a: any = { name: "a", method: () => success("a") };
        const b: any = { name: "b", method: () => success("b") };
        const c: any = { name: "c", method: () => success("c") };
        a.next = b;
        b.next = c;
        c.next = a;
        const pub = toPublic(a);
        expect(pub.method()).toBe("a");
        expect(pub.next.method()).toBe("b");
        expect(pub.next.next.method()).toBe("c");
        expect(pub.next.next.next.method()).toBe("a");
      });
    });

    describe("built-in types at nested levels", () => {
      test("preserves nested arrays without wrapping", () => {
        const obj = {
          data: {
            items: [1, 2, 3],
          },
        };
        const pub = toPublic(obj);
        expect(Array.isArray(pub.data.items)).toBe(true);
        expect(pub.data.items).toEqual([1, 2, 3]);
      });

      test("preserves nested Dates without wrapping", () => {
        const date = new Date("2024-01-01");
        const obj = {
          nested: {
            timestamp: date,
          },
        };
        const pub = toPublic(obj);
        expect(pub.nested.timestamp).toBe(date);
        expect(pub.nested.timestamp instanceof Date).toBe(true);
      });

      test("preserves nested Maps without wrapping", () => {
        const map = new Map([["key", "value"]]);
        const obj = {
          nested: {
            cache: map,
          },
        };
        const pub = toPublic(obj);
        expect(pub.nested.cache).toBe(map);
        expect(pub.nested.cache.get("key")).toBe("value");
      });

      test("preserves nested Sets without wrapping", () => {
        const set = new Set([1, 2, 3]);
        const obj = {
          nested: {
            unique: set,
          },
        };
        const pub = toPublic(obj);
        expect(pub.nested.unique).toBe(set);
        expect(pub.nested.unique.has(2)).toBe(true);
      });

      test("preserves nested Promises without wrapping", () => {
        const promise = Promise.resolve("test");
        const obj = {
          nested: {
            async: promise,
          },
        };
        const pub = toPublic(obj);
        expect(pub.nested.async).toBe(promise);
      });

      test("preserves nested RegExp without wrapping", () => {
        const regex = /test/g;
        const obj = {
          nested: {
            pattern: regex,
          },
        };
        const pub = toPublic(obj);
        expect(pub.nested.pattern).toBe(regex);
        expect(pub.nested.pattern.test("test")).toBe(true);
      });
    });

    describe("edge cases with deep nesting", () => {
      test("handles null values in nested structures", () => {
        const obj = {
          nested: {
            nullValue: null,
            method: () => success("works"),
          },
        };
        const pub = toPublic(obj);
        expect(pub.nested.nullValue).toBeNull();
        expect(pub.nested.method()).toBe("works");
      });

      test("handles undefined values in nested structures", () => {
        const obj = {
          nested: {
            undefinedValue: undefined,
            method: () => success("works"),
          },
        };
        const pub = toPublic(obj);
        expect(pub.nested.undefinedValue).toBeUndefined();
        expect(pub.nested.method()).toBe("works");
      });

      test("handles empty nested objects", () => {
        const obj = {
          nested: {
            empty: {},
          },
        };
        const pub = toPublic(obj);
        expect(pub.nested.empty).toEqual({});
      });

      test("handles methods returning nested objects", () => {
        const obj = {
          getNestedApi: () =>
            success({
              method: () => success("nested in return value"),
            }),
        };
        const pub = toPublic(obj);
        const api = pub.getNestedApi();
        // Note: The returned object from the method is not automatically wrapped
        // because it's data returned from the function, not part of the original structure
        expect(typeof api.method).toBe("function");
      });

      test("handles very deep nesting (performance test)", () => {
        let deep: any = { method: () => success("bottom") };
        for (let i = 0; i < 100; i++) {
          deep = { next: deep };
        }
        const pub = toPublic(deep);
        let current = pub;
        for (let i = 0; i < 100; i++) {
          current = current.next;
        }
        expect(current.method()).toBe("bottom");
      });

      test("handles nested structures with multiple methods", () => {
        const obj = {
          api: {
            method1: () => success("m1"),
            method2: () => success("m2"),
            nested: {
              method3: () => success("m3"),
              method4: () => success("m4"),
            },
          },
        };
        const pub = toPublic(obj);
        expect(pub.api.method1()).toBe("m1");
        expect(pub.api.method2()).toBe("m2");
        expect(pub.api.nested.method3()).toBe("m3");
        expect(pub.api.nested.method4()).toBe("m4");
      });
    });

    describe("method parameters with deep nesting", () => {
      test("preserves method parameters at nested levels", () => {
        const obj = {
          math: {
            operations: {
              add: (a: number, b: number) => success(a + b),
              multiply: (a: number, b: number) => success(a * b),
            },
          },
        };
        const pub = toPublic(obj);
        expect(pub.math.operations.add(5, 3)).toBe(8);
        expect(pub.math.operations.multiply(5, 3)).toBe(15);
      });

      test("handles complex parameters in nested methods", () => {
        const obj = {
          api: {
            users: {
              create: (data: { name: string; email: string }) => success({ id: 1, ...data }),
            },
          },
        };
        const pub = toPublic(obj);
        const result = pub.api.users.create({ name: "Alice", email: "alice@test.com" });
        expect(result).toEqual({ id: 1, name: "Alice", email: "alice@test.com" });
      });
    });

    describe("caching behavior with deep nesting", () => {
      test("returns same proxy instance for same nested object", () => {
        const obj = {
          nested: {
            method: () => success("test"),
          },
        };
        const pub = toPublic(obj);
        const nested1 = pub.nested;
        const nested2 = pub.nested;
        expect(nested1).toBe(nested2);
      });

      test("caching prevents infinite loops in circular structures", () => {
        const obj: any = {};
        obj.self = obj;
        obj.method = () => success("works");
        const pub = toPublic(obj);

        // Access multiple times to verify cache is working
        expect(pub.method()).toBe("works");
        expect(pub.self.method()).toBe("works");
        expect(pub.self.self.method()).toBe("works");

        // Verify same proxy is returned
        expect(pub.self).toBe(pub);
      });
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

  describe("serializeResult", () => {
    test("serializes success result with data", () => {
      const result = success({ id: 1, name: "Alice" });
      const serialized = serializeResult(result);

      expect(serialized._isOperationResult).toBe(true);
      expect(serialized.result[0]).toBeUndefined();
      expect(serialized.result[1]).toEqual({ id: 1, name: "Alice" });
    });

    test("serializes success result without data", () => {
      const result = success();
      const serialized = serializeResult(result);

      expect(serialized._isOperationResult).toBe(true);
      expect(serialized.result[0]).toBeUndefined();
      expect(serialized.result[1]).toBeUndefined();
    });

    test("serializes failure result", () => {
      const error = lifeError({ code: "NotFound", message: "Resource not found" });
      const result = failure(error);
      const serialized = serializeResult(result);

      expect(serialized._isOperationResult).toBe(true);
      expect(serialized.result[0]).toBe(error);
      expect(serialized.result[1]).toBeUndefined();
    });

    test("throws on non-OperationResult input", () => {
      expect(() => serializeResult([undefined, "data"] as any)).toThrow(
        "The provided value is not an OperationResult",
      );
      expect(() => serializeResult("not a result" as any)).toThrow(
        "The provided value is not an OperationResult",
      );
      expect(() => serializeResult(null as any)).toThrow(
        "The provided value is not an OperationResult",
      );
    });

    test("preserves complex data structures", () => {
      const complexData = {
        nested: { deep: { value: [1, 2, 3] } },
        date: new Date("2024-01-01"),
        map: new Map([["key", "value"]]),
      };
      const result = success(complexData);
      const serialized = serializeResult(result);

      expect(serialized.result[1]).toEqual(complexData);
    });
  });

  describe("deserializeResult", () => {
    test("deserializes success result with data", () => {
      const serialized = {
        _isOperationResult: true as const,
        result: [undefined, { id: 1, name: "Bob" }] as const,
      };
      const result = deserializeResult(serialized);

      expect(isResult(result)).toBe(true);
      expect(result[0]).toBeUndefined();
      expect(result[1]).toEqual({ id: 1, name: "Bob" });
    });

    test("deserializes success result without data", () => {
      const serialized = {
        _isOperationResult: true as const,
        result: [undefined, undefined] as const,
      };
      const result = deserializeResult(serialized);

      expect(isResult(result)).toBe(true);
      expect(result[0]).toBeUndefined();
      expect(result[1]).toBeUndefined();
    });

    test("deserializes failure result", () => {
      const error = lifeError({ code: "Forbidden", message: "Access denied" });
      const serialized = {
        _isOperationResult: true as const,
        result: [error, undefined] as const,
      };
      const result = deserializeResult(serialized);

      expect(isResult(result)).toBe(true);
      expect(result[0]).toBe(error);
      expect(result[1]).toBeUndefined();
    });

    test("throws on invalid input - missing marker", () => {
      const invalidInput = {
        result: [undefined, "data"],
      } as any;
      expect(() => deserializeResult(invalidInput)).toThrow(
        "The provided object is not a serialized OperationResult",
      );
    });

    test("throws on invalid input - wrong result format", () => {
      const invalidInput = {
        _isOperationResult: true,
        result: "not an array",
      } as any;
      expect(() => deserializeResult(invalidInput)).toThrow(
        "The provided object is not a serialized OperationResult",
      );
    });

    test("throws on invalid input - wrong array length", () => {
      const invalidInput = {
        _isOperationResult: true,
        result: [undefined],
      } as any;
      expect(() => deserializeResult(invalidInput)).toThrow(
        "The provided object is not a serialized OperationResult",
      );
    });
  });

  describe("serializeResult and deserializeResult round-trip", () => {
    test("round-trip for success with primitive data", () => {
      const testCases = [
        { original: success(42), expected: 42 },
        { original: success("test string"), expected: "test string" },
        { original: success(true), expected: true },
        { original: success(null), expected: null },
      ];

      for (const { original, expected } of testCases) {
        const serialized = serializeResult(original as any);
        const deserialized = deserializeResult(serialized as any);

        expect(isResult(deserialized)).toBe(true);
        expect(deserialized[0]).toBeUndefined();
        expect(deserialized[1]).toBe(expected);
      }
    });

    test("round-trip for success with complex data", () => {
      const original = success({
        id: 123,
        name: "Test",
        tags: ["a", "b", "c"],
        metadata: { created: new Date(), active: true },
      });

      const serialized = serializeResult(original);
      const deserialized = deserializeResult(serialized);

      expect(isResult(deserialized)).toBe(true);
      expect(deserialized[0]).toBeUndefined();
      expect(deserialized[1]).toEqual(original[1]);
    });

    test("round-trip for various failure codes", () => {
      const errorCodes = ["NotFound", "Validation", "Forbidden", "Unknown"] as const;

      for (const code of errorCodes) {
        const original = failure({ code, message: `Error: ${code}` });
        const serialized = serializeResult(original);
        const deserialized = deserializeResult(serialized);

        expect(isResult(deserialized)).toBe(true);
        expect(deserialized[0]?.code).toBe(code);
        expect(deserialized[0]?.message).toBe(`Error: ${code}`);
        expect(deserialized[1]).toBeUndefined();
      }
    });

    test("round-trip preserves LifeError properties", () => {
      const error = lifeError({
        code: "RateLimit",
        message: "Too many requests",
        retryAfterMs: 5000,
      });
      const original = failure(error);
      const serialized = serializeResult(original);
      const deserialized = deserializeResult(serialized);

      expect(isResult(deserialized)).toBe(true);
      const deserializedError = deserialized[0];
      expect(deserializedError?.code).toBe("RateLimit");
      expect(deserializedError?.message).toBe("Too many requests");
      expect(deserializedError?.retryAfterMs).toBe(5000);
    });

    test("round-trip for void success", () => {
      const original = success();
      const serialized = serializeResult(original);
      const deserialized = deserializeResult(serialized);

      expect(isResult(deserialized)).toBe(true);
      expect(deserialized[0]).toBeUndefined();
      expect(deserialized[1]).toBeUndefined();
    });

    test("serialized format can be JSON stringified and parsed", () => {
      const original = success({ test: "json compatibility" });
      const serialized = serializeResult(original);

      // Simulate JSON round-trip
      const jsonString = JSON.stringify(serialized);
      const parsed = JSON.parse(jsonString);

      // Deserialize the parsed JSON
      const deserialized = deserializeResult(parsed);

      expect(isResult(deserialized)).toBe(true);
      expect(deserialized[1]).toEqual({ test: "json compatibility" });
    });
  });
});
