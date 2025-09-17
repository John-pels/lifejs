console.log('Error.captureStackTrace exists:', typeof Error.captureStackTrace);

class TestError extends Error {
  constructor(message) {
    super(message);
    console.log('Stack after super():', !!this.stack);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TestError);
    }
    console.log('Stack after captureStackTrace:', !!this.stack);
  }
}

const e1 = new Error('Regular error');
console.log('\nRegular Error stack exists:', !!e1.stack);

const e2 = new TestError('Test error');
console.log('TestError stack exists:', !!e2.stack);

console.log('\nStack preview:');
console.log(e2.stack?.split('\n').slice(0, 3).join('\n'));