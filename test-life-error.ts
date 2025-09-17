import { lifeError } from "./packages/life/shared/error";

// Test 1: Basic LifeError
const error1 = lifeError({
  code: "Validation",
  message: "Test validation error",
});

console.log("Test 1 - Basic LifeError:");
console.log("Stack exists:", !!error1.stack);
console.log("Stack preview:", error1.stack?.split("\n").slice(0, 3).join("\n"));

// Test 2: LifeError with Unknown code and nested error
const nestedError = new Error("Nested error");
const error2 = lifeError({
  code: "Unknown",
  message: "Test unknown error",
  error: nestedError,
});

console.log("\nTest 2 - Unknown LifeError with nested error:");
console.log("Stack exists:", !!error2.stack);
console.log("Stack preview:", error2.stack?.split("\n").slice(0, 3).join("\n"));

// Test 3: Check Error.captureStackTrace
console.log("\nEnvironment check:");
console.log("Error.captureStackTrace exists:", typeof Error.captureStackTrace);

// Test 4: Check if super() sets the stack
class TestSuperError extends Error {
  constructor(message: string) {
    super(message);
    console.log("Stack after super():", !!this.stack);
  }
}

const testSuper = new TestSuperError("Test super");
console.log("Final stack exists:", !!testSuper.stack);