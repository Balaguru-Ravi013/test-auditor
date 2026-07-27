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
    blurb:
      'Some tests are turned off (.skip) or forced to run alone (.only). That can hide bugs or make CI look healthier than it is.',
  },
  'async-flake': {
    title: 'Async flake risks',
    blurb:
      'Timing-sensitive patterns (sleeps, missing awaits) that may pass sometimes and fail other times — hard to trust in CI.',
  },
  'snapshot-overuse': {
    title: 'Snapshot overuse',
    blurb:
      'Too many large snapshots. Failures become “update the snapshot” instead of clear product regressions.',
  },
  'rtl-antipattern': {
    title: 'Testing Library anti-patterns',
    blurb:
      'Tests dig into DOM internals instead of what users see. Small UI refactors then break many tests unnecessarily.',
  },
  'non-deterministic': {
    title: 'Non-deterministic APIs',
    blurb:
      'Live clocks or random values without control. The same test can give different results on different runs.',
  },
  'debug-leftover': {
    title: 'Debug leftovers',
    blurb:
      'console.log, screen.debug, or debugger left in tests — noise in CI logs and a sign of unfinished cleanup.',
  },
  'assertion-quality': {
    title: 'Assertion quality',
    blurb:
      'Weak or empty checks. The test may “pass” without proving the behavior you care about.',
  },
  'empty-test': {
    title: 'Empty tests',
    blurb:
      'Placeholder tests with no real checks. They inflate the pass count without adding safety.',
  },
  'duplicate-title': {
    title: 'Duplicate titles',
    blurb:
      'Several tests share the same name, so failures are harder to find and discuss in reviews.',
  },
  'conditional-logic': {
    title: 'Conditional test logic',
    blurb:
      'Assertions wrapped in if/catch can silently skip checks. A “green” suite may not have verified the path you think.',
  },
  'hardcoded-secret': {
    title: 'Hardcoded secrets',
    blurb:
      'API keys or tokens appear in test files. That is a security risk if the repo is shared or published.',
  },
  'network-unmocked': {
    title: 'Unmocked network I/O',
    blurb:
      'Tests may call real network services. Runs become slow, flaky, and can hit production or rate limits by accident.',
  },
  'mocking-quality': {
    title: 'Mocking quality',
    blurb:
      'Mocks are redundant, unused, or replace the code under test — so the suite may not exercise real behavior.',
  },
  'nextjs-hygiene': {
    title: 'Next.js test hygiene',
    blurb:
      'Next.js router/image/navigation used without the usual test doubles. Component tests can crash or behave inconsistently.',
  },
  readability: {
    title: 'Readability',
    blurb:
      'Vague names or very deep nesting. Stakeholders and new engineers struggle to see what is covered.',
  },
  'timer-hygiene': {
    title: 'Timer hygiene',
    blurb:
      'Fake timers started but not advanced or restored. Later tests can fail for unrelated timing reasons.',
  },
  'parse-error': {
    title: 'Parse errors',
    blurb:
      'The auditor could not read this file. Findings may be incomplete until the syntax or parser setup is fixed.',
  },
};
