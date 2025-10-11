# Fix Test Implementations and Improve Mock Consistency

## Summary

This PR improves test reliability and mock implementations across Life.js providers. Key changes focus on fixing streaming test issues, standardizing error handling, and improving WebSocket mocks.

## Changes By Component

### 1. LLM Provider Tests

#### XAI LLM Tests ✅

```typescript
// Before - Variable scoping issue
const contentChunks = [...];  // Outside mock
vi.mock("openai", () => {
  // contentChunks not accessible here
});

// After - Fixed scoping
vi.mock("openai", () => {
  const contentChunks = [...];  // Inside mock where needed
  // Rest of mock implementation
});
```

- Fixed variable scope issue with streaming content chunks
- Corrected variable naming from `streamChunks` to `contentChunks`
- Improved mock structure to match OpenAI API format

#### OpenAI LLM Tests ✅

```typescript
// Before - Inconsistent async mocking
create: vi.fn(async () => ({ ... }))

// After - Better async mock pattern
create: vi.fn().mockResolvedValue({ ... })
```

- Fixed mock data scoping issues
- Standardized async mocking patterns
- Corrected error code expectations
- Improved streaming response structure

#### Mistral LLM Tests 🔧

```typescript
// Added missing tool type information
tool_calls: [{
  id: "call1",
  function: { name: "testTool", arguments: '{"key":"value"}' },
  type: "function"  // Previously missing
}]
```

- Fixed mock implementations for async handling
- Added complete type information for tool calls
- Improved stream handling for Mistral API compliance

### 2. TTS Provider Tests

#### Cartesia TTS Tests ✅

```typescript
// Before - Incomplete WebSocket mock
socket: { 
  send: vi.fn() 
}

// After - Complete WebSocket interface
socket: {
  send: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn()
}
```

- Added complete WebSocket event handling
- Fixed method chaining by returning socket instance
- Improved message handling consistency
- Added missing WebSocket lifecycle methods

### 3. STT Provider Tests

#### Deepgram Tests ✅

```typescript
// Fixed undefined mock socket reference
const mockSocket2 = createMockSocket();  // Now properly defined
```

- Fixed undefined mock socket references
- Improved WebSocket mock consistency
- Enhanced error handling patterns

#### Silero Tests ✅

- Standardized error message formats
- Updated error codes for input validation
- Improved inference failure handling

## Testing Patterns Established

### 1. Async Operation Mocking

```typescript
// Preferred pattern for async mocks
vi.fn().mockResolvedValue({ ... })
```

### 2. WebSocket Event Handling

```typescript
// Standard WebSocket mock structure
{
  socket: {
    send: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn()
  },
  on: vi.fn().mockReturnThis(),
  off: vi.fn().mockReturnThis()
}
```

### 3. Error Handling Standards

```typescript
// Standard error response format
op.failure({
  code: "Invalid",  // Consistent error codes
  message: "Specific error message"
})
```

## Testing Notes

### Verified Components

- ✅ LLM Providers (XAI, OpenAI)
- ✅ TTS Providers (Cartesia)
- ✅ STT Providers (Deepgram)
- ✅ VAD Providers (Silero)

### No Breaking Changes

- All modifications are test-only improvements
- No changes to public APIs
- Maintains existing behavior

## Future Improvements

1. Add timeout handling tests for streaming operations
2. Enhance type coverage in test mocks
3. Add more comprehensive streaming error cases

## Review Focus Areas

Please pay special attention to:

1. Mock implementation patterns
2. Error handling consistency
3. WebSocket event handling
4. Streaming test implementations

## Related Issues

- Fixes undefined `contentChunks` in LLM streaming tests
- Resolves WebSocket mock inconsistencies
- Standardizes error handling across providers
- Fixes mock socket reference issues
