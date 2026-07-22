// src/rules/types.ts
export type Severity = 'error' | 'warning' | 'info';

export type StrategyId =
  | 'disabled-focused'
  | 'async-flake'
  | 'snapshot-overuse'
  | 'rtl-antipattern'
  | 'non-deterministic'
  | 'debug-leftover'
  | 'assertion-quality'
  | 'empty-test'
  | 'duplicate-title'
  | 'conditional-logic'
  | 'hardcoded-secret'
  | 'network-unmocked'
  | 'mocking-quality'
  | 'nextjs-hygiene'
  | 'readability'
  | 'timer-hygiene'
  | 'parse-error';

export interface TestIssue {
  file: string;
  line: number;
  rule: string;
  strategy: StrategyId;
  message: string;
  severity: Severity;
}

export const STRATEGY_META: Record<
  StrategyId,
  { title: string; blurb: string }
> = {
  'disabled-focused': {
    title: 'Disabled / focused tests',
    blurb: '.skip, .only, xit/fit, and test.todo left in the suite',
  },
  'async-flake': {
    title: 'Async flake risks',
    blurb: 'Sleeps, done callbacks, missing awaits, floating promises',
  },
  'snapshot-overuse': {
    title: 'Snapshot overuse',
    blurb: 'Too many or oversized snapshots that hide regressions',
  },
  'rtl-antipattern': {
    title: 'Testing Library anti-patterns',
    blurb: 'DOM implementation details instead of accessible queries',
  },
  'non-deterministic': {
    title: 'Non-deterministic APIs',
    blurb: 'Uncontrolled Date / random / clocks in assertions',
  },
  'debug-leftover': {
    title: 'Debug leftovers',
    blurb: 'console.*, screen.debug, debugger left behind',
  },
  'assertion-quality': {
    title: 'Assertion quality',
    blurb: 'Weak matchers, tautologies, assertion spam',
  },
  'empty-test': {
    title: 'Empty tests',
    blurb: 'Tests with no meaningful body',
  },
  'duplicate-title': {
    title: 'Duplicate titles',
    blurb: 'Repeated it/test names that obscure failures',
  },
  'conditional-logic': {
    title: 'Conditional test logic',
    blurb: 'Branching around expects or swallowed errors',
  },
  'hardcoded-secret': {
    title: 'Hardcoded secrets',
    blurb: 'API keys, tokens, or credentials in test source',
  },
  'network-unmocked': {
    title: 'Unmocked network I/O',
    blurb: 'fetch/axios/http calls that may hit real services',
  },
  'mocking-quality': {
    title: 'Mocking quality',
    blurb: 'Redundant mocks, unused spies, mocking the SUT',
  },
  'nextjs-hygiene': {
    title: 'Next.js test hygiene',
    blurb: 'Router/image/navigation usage without common mocks',
  },
  readability: {
    title: 'Readability',
    blurb: 'Vague titles, extreme nesting, oversized files',
  },
  'timer-hygiene': {
    title: 'Timer hygiene',
    blurb: 'Fake timers without advance/restore patterns',
  },
  'parse-error': {
    title: 'Parse errors',
    blurb: 'Files the auditor could not parse',
  },
};
