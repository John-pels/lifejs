import { attempt, success, failure, operation } from "./packages/life/shared/operation";
import { lifeError } from "./packages/life/shared/error";

// Test 1: Function that returns either success or failure
const mixedFunction = () => {
  if (Math.random() > 0.5) {
    return success("hello");
  }
  return failure(lifeError({ code: "NotFound" }));
};

// Test 2: Using attempt with mixed function
const test = async () => {
  const [error, data] = attempt(mixedFunction);
  
  // Check if data is properly typed as string (not unknown)
  if (!error) {
    // This should work if type inference is correct
    const upperCase: string = data.toUpperCase();
    console.log("Data is correctly typed as string:", upperCase);
  }
};

// Test 3: Async function with mixed returns
const asyncMixed = async () => {
  if (Math.random() > 0.5) {
    return success(42);
  }
  return failure<number>(lifeError({ code: "Forbidden" }));
};

const testAsync = async () => {
  const [error, data] = await attempt(asyncMixed);
  
  if (!error) {
    // This should work if type inference is correct
    const doubled: number = data * 2;
    console.log("Data is correctly typed as number:", doubled);
  }
};

// Test type display
type MixedResult = ReturnType<typeof mixedFunction>;
type ExtractedData = MixedResult extends { 1: infer D } ? D : never;

console.log("Type tests passed!");