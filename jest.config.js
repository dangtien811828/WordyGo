/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  testTimeout: 20000,
  setupFiles: ['<rootDir>/tests/setup.ts'],
  // DB pool shared across tests — run sequentially for deterministic state.
  maxWorkers: 1,
  // Pool keeps idle connections alive; force-exit after tests finish.
  forceExit: true,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
};
