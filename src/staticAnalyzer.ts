// src/staticAnalyzer.ts
import fs from 'fs';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import type { StrategyId, TestIssue } from './rules/types.js';

const traverse =
  typeof _traverse === 'function'
    ? _traverse
    : ((_traverse as unknown as { default: typeof _traverse }).default);

export type { TestIssue } from './rules/types.js';

const TEST_ROOTS = new Set(['it', 'test', 'fit', 'xit']);
const DESCRIBE_ROOTS = new Set(['describe', 'fdescribe', 'xdescribe']);

const SECRET_RE =
  /(?:api[_-]?key|secret|token|password|passwd|authorization|bearer|private[_-]?key|access[_-]?key)\s*[:=]\s*['"`][^'"`]{8,}['"`]/i;
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
const AWS_RE = /AKIA[0-9A-Z]{16}/;
const SK_RE = /(?:sk|pk)_live_[A-Za-z0-9]{16,}/;

const VAGUE = new Set([
  'test',
  'works',
  'ok',
  'passes',
  'success',
  'should work',
  'it works',
  'temp',
  'foo',
  'bar',
  'asdf',
]);

function issue(
  file: string,
  line: number,
  rule: string,
  strategy: StrategyId,
  message: string,
  severity: TestIssue['severity']
): TestIssue {
  return { file, line, rule, strategy, message, severity };
}

function calleeName(node: t.Node): string | null {
  if (t.isIdentifier(node)) return node.name;
  if (t.isMemberExpression(node) && !node.computed) {
    const obj = calleeName(node.object);
    const prop = t.isIdentifier(node.property) ? node.property.name : null;
    return obj && prop ? `${obj}.${prop}` : null;
  }
  return null;
}

function rootName(node: t.Node): string | null {
  if (t.isIdentifier(node)) return node.name;
  if (t.isMemberExpression(node)) return rootName(node.object);
  return null;
}

function strArg(args: t.CallExpression['arguments']): string | null {
  const a = args[0];
  if (t.isStringLiteral(a)) return a.value;
  if (t.isTemplateLiteral(a) && a.expressions.length === 0) {
    return a.quasis.map((q) => q.value.cooked ?? '').join('');
  }
  return null;
}

function fnArg(args: t.CallExpression['arguments']): t.Function | null {
  for (const a of args) if (t.isFunction(a)) return a;
  return null;
}

function emptyFn(fn: t.Function): boolean {
  return t.isBlockStatement(fn.body) && fn.body.body.length === 0;
}

function stmtCount(fn: t.Function): number {
  if (t.isBlockStatement(fn.body)) return fn.body.body.length;
  return 1;
}

function lineOf(node: t.Node): number {
  return node.loc?.start.line ?? 0;
}

function lineAt(code: string, index: number): number {
  if (index < 0) return 1;
  return code.slice(0, index).split('\n').length;
}

function mockCount(code: string, mod: string): number {
  const re = new RegExp(
    `jest\\.mock\\(\\s*['"\`]${mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`,
    'g'
  );
  return code.match(re)?.length ?? 0;
}

function hasMock(code: string, mod: string): boolean {
  return mockCount(code, mod) > 0;
}

export function analyzeFile(filePath: string): TestIssue[] {
  const code = fs.readFileSync(filePath, 'utf-8');
  const issues: TestIssue[] = [];
  const fileLines = code.split('\n').length;

  let ast: t.File;
  try {
    ast = parse(code, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'typescript', 'decorators-legacy'],
      errorRecovery: true,
    });
  } catch (err) {
    return [
      issue(
        filePath,
        0,
        'parse-error',
        'parse-error',
        `Could not parse file: ${(err as Error).message}`,
        'error'
      ),
    ];
  }

  // --- file-level quick scans ---
  const secretIdx = [SECRET_RE, JWT_RE, AWS_RE, SK_RE]
    .map((re) => code.search(re))
    .find((i) => i >= 0);
  if (secretIdx != null && secretIdx >= 0) {
    issues.push(
      issue(
        filePath,
        lineAt(code, secretIdx),
        'hardcoded-secret',
        'hardcoded-secret',
        'Possible hardcoded secret/token in test source',
        'error'
      )
    );
  }

  if (fileLines > 800) {
    issues.push(
      issue(
        filePath,
        1,
        'oversized-test-file',
        'readability',
        `Test file is very large (${fileLines} lines) — split by feature`,
        'info'
      )
    );
  }

  const seenTitles = new Map<string, number>();
  const mockedModules = new Set<string>();
  let snapshotCount = 0;
  let inlineSnapChars = 0;
  let describeDepth = 0;
  let maxDescribeDepth = 0;
  let usesFakeTimers = false;
  let advancesTimers = false;
  let restoresTimers = false;
  let networkCalls = 0;
  let testIdQueries = 0;
  let a11yQueries = 0;

  const hasNetworkMockInfra =
    /msw|setupServer|nock\(|MockAdapter|global(This)?\.fetch\s*=|jest\.spyOn\([^)]*fetch/i.test(
      code
    );

  traverse(ast, {
    DebuggerStatement(p) {
      issues.push(
        issue(
          filePath,
          lineOf(p.node),
          'debugger-leftover',
          'debug-leftover',
          'debugger statement left in tests',
          'error'
        )
      );
    },

    NewExpression(p) {
      if (t.isIdentifier(p.node.callee, { name: 'Date' }) && p.node.arguments.length === 0) {
        issues.push(
          issue(
            filePath,
            lineOf(p.node),
            'nondeterministic-date',
            'non-deterministic',
            'new Date() without mocking makes time-sensitive tests flaky',
            'warning'
          )
        );
      }
    },

    MemberExpression(p) {
      const prop = t.isIdentifier(p.node.property) ? p.node.property.name : '';
      if (prop === 'innerHTML' || prop === 'outerHTML') {
        issues.push(
          issue(
            filePath,
            lineOf(p.node),
            'rtl-innerhtml',
            'rtl-antipattern',
            'innerHTML/outerHTML couples tests to markup — prefer text/role queries',
            'warning'
          )
        );
      }
    },

    CallExpression: {
      enter(p) {
        const name = calleeName(p.node.callee);
        const root = rootName(p.node.callee);
        const line = lineOf(p.node);
        if (!name || !root) return;

        if (DESCRIBE_ROOTS.has(root) || name.startsWith('describe.')) {
          describeDepth++;
          maxDescribeDepth = Math.max(maxDescribeDepth, describeDepth);
        }

        // mocks
        if (name === 'jest.mock' || name === 'jest.doMock') {
          const mod = strArg(p.node.arguments);
          if (mod) mockedModules.add(mod);
        }

        // focused / skipped / todo
        if (/\.only$/.test(name) || root === 'fit' || root === 'fdescribe') {
          issues.push(
            issue(
              filePath,
              line,
              'no-focused-tests',
              'disabled-focused',
              `${name} focuses a subset and can hide failures in CI`,
              'error'
            )
          );
        }
        if (/\.skip$/.test(name) || root === 'xit' || root === 'xtest' || root === 'xdescribe') {
          issues.push(
            issue(
              filePath,
              line,
              'no-skipped-tests',
              'disabled-focused',
              `${name} skips coverage — confirm this is intentional`,
              'warning'
            )
          );
        }
        if (name === 'it.todo' || name === 'test.todo') {
          issues.push(
            issue(
              filePath,
              line,
              'test-todo',
              'disabled-focused',
              'test.todo placeholder — unfinished test',
              'warning'
            )
          );
        }

        // timers
        if (name === 'jest.useFakeTimers') usesFakeTimers = true;
        if (
          name === 'jest.advanceTimersByTime' ||
          name === 'jest.runAllTimers' ||
          name === 'jest.runOnlyPendingTimers' ||
          name === 'jest.advanceTimersToNextTimer'
        ) {
          advancesTimers = true;
        }
        if (name === 'jest.useRealTimers' || name === 'jest.clearAllTimers') {
          restoresTimers = true;
        }

        // debug
        if (
          name === 'console.log' ||
          name === 'console.debug' ||
          name === 'console.info' ||
          name === 'console.dir'
        ) {
          issues.push(
            issue(
              filePath,
              line,
              'console-leftover',
              'debug-leftover',
              `${name} left in test source`,
              'warning'
            )
          );
        }
        if (name === 'screen.debug') {
          issues.push(
            issue(
              filePath,
              line,
              'screen-debug',
              'debug-leftover',
              'screen.debug() left in tests',
              'warning'
            )
          );
        }

        // network
        if (
          name === 'fetch' ||
          name === 'axios' ||
          /^axios\.(get|post|put|delete|patch)$/.test(name) ||
          name === 'http.get' ||
          name === 'http.request' ||
          name === 'https.get'
        ) {
          networkCalls++;
        }

        // RTL
        if (
          /querySelector(All)?$/.test(name) ||
          name === 'document.getElementById' ||
          name === 'document.getElementsByClassName'
        ) {
          issues.push(
            issue(
              filePath,
              line,
              'rtl-query-selector',
              'rtl-antipattern',
              `${name} couples tests to DOM structure — prefer role/label/text queries`,
              'warning'
            )
          );
        }
        if (/^(screen\.)?(get|find|query)(All)?ByTestId$/.test(name)) testIdQueries++;
        if (
          /^(screen\.)?(get|find|query)(All)?By(Role|LabelText|Text|PlaceholderText|DisplayValue|AltText|Title)$/.test(
            name
          )
        ) {
          a11yQueries++;
        }

        // sleeps
        if (name === 'setTimeout' || name === 'setInterval') {
          const delay = p.node.arguments[1];
          if (t.isNumericLiteral(delay) && delay.value >= 50) {
            issues.push(
              issue(
                filePath,
                line,
                'async-sleep',
                'async-flake',
                `${name}(${delay.value}) is a flake risk — use fake timers or waitFor/findBy`,
                'warning'
              )
            );
          }
        }

        if (name === 'waitFor' || name === 'waitForElementToBeRemoved') {
          const cb = fnArg(p.node.arguments);
          if (cb && emptyFn(cb)) {
            issues.push(
              issue(
                filePath,
                line,
                'empty-waitfor',
                'async-flake',
                'waitFor callback is empty',
                'warning'
              )
            );
          }
        }

        // snapshot matchers: expect(...).toMatchSnapshot()
        if (
          t.isMemberExpression(p.node.callee) &&
          t.isIdentifier(p.node.callee.property) &&
          (p.node.callee.property.name === 'toMatchSnapshot' ||
            p.node.callee.property.name === 'toMatchInlineSnapshot')
        ) {
          snapshotCount++;
          if (p.node.callee.property.name === 'toMatchInlineSnapshot') {
            const snap = p.node.arguments[0];
            if (t.isStringLiteral(snap)) inlineSnapChars += snap.value.length;
            if (t.isTemplateLiteral(snap)) {
              inlineSnapChars += snap.quasis.reduce(
                (n, q) => n + (q.value.cooked?.length ?? 0),
                0
              );
            }
          }
        }

        // ---- individual tests ----
        const isTest =
          TEST_ROOTS.has(root) || name.startsWith('it.') || name.startsWith('test.');
        if (!isTest) return;
        if (/\.(only|skip|todo)$/.test(name)) return;
        if (root === 'xit' || root === 'xtest' || root === 'fit') return;

        const title = strArg(p.node.arguments) ?? 'unnamed';
        const cb = fnArg(p.node.arguments);

        const prev = seenTitles.get(title);
        if (prev != null) {
          issues.push(
            issue(
              filePath,
              line,
              'duplicate-test-name',
              'duplicate-title',
              `Duplicate test title "${title}" (also at line ${prev})`,
              'warning'
            )
          );
        } else seenTitles.set(title, line);

        const norm = title.trim().toLowerCase();
        if (norm.length < 6 || VAGUE.has(norm) || /^test\s*\d*$/i.test(title)) {
          issues.push(
            issue(
              filePath,
              line,
              'vague-test-title',
              'readability',
              `Vague test title "${title}" — describe the behavior`,
              'info'
            )
          );
        }

        if (!cb) return;

        if (cb.params.length > 0 && t.isIdentifier(cb.params[0], { name: 'done' })) {
          issues.push(
            issue(
              filePath,
              line,
              'done-callback',
              'async-flake',
              `Test "${title}" uses done callback — prefer async/await`,
              'warning'
            )
          );
        }

        if (emptyFn(cb) || stmtCount(cb) === 0) {
          issues.push(
            issue(
              filePath,
              line,
              'empty-test',
              'empty-test',
              `Test "${title}" has an empty body`,
              'error'
            )
          );
          return;
        }

        let expectCount = 0;
        let hasAssertion = false;
        let weak = 0;
        let hasAwait = false;
        let floatingThen = false;
        let conditionalExpect = false;
        let emptyCatch = false;

        const cbPath = (p.get('arguments') as NodePath[]).find((a) =>
          a.isFunction()
        ) as NodePath<t.Function> | undefined;
        if (!cbPath) return;

        cbPath.traverse({
          AwaitExpression() {
            hasAwait = true;
          },
          CatchClause(cp) {
            if (cp.node.body.body.length === 0) emptyCatch = true;
          },
          IfStatement(ip) {
            let hit = false;
            ip.traverse({
              CallExpression(cp) {
                if (calleeName(cp.node.callee) === 'expect') hit = true;
              },
            });
            if (hit) conditionalExpect = true;
          },
          CallExpression(cp) {
            const cn = calleeName(cp.node.callee);
            if (cn === 'expect') {
              hasAssertion = true;
              expectCount++;
              const a0 = cp.node.arguments[0];
              if (t.isBooleanLiteral(a0)) {
                issues.push(
                  issue(
                    filePath,
                    lineOf(cp.node),
                    'tautological-expect',
                    'assertion-quality',
                    `Test "${title}" uses expect(${a0.value}) — does not test behavior`,
                    'error'
                  )
                );
              }

              // expect(...).resolves without await
              const mem = cp.parentPath;
              if (
                mem?.isMemberExpression() &&
                t.isIdentifier(mem.node.property) &&
                (mem.node.property.name === 'resolves' ||
                  mem.node.property.name === 'rejects')
              ) {
                let cur: NodePath | null = mem;
                let awaited = false;
                while (cur && cur !== cbPath) {
                  if (cur.isAwaitExpression()) {
                    awaited = true;
                    break;
                  }
                  cur = cur.parentPath;
                }
                if (!awaited) {
                  issues.push(
                    issue(
                      filePath,
                      lineOf(cp.node),
                      'floating-async-matcher',
                      'async-flake',
                      `expect(...).${mem.node.property.name} in "${title}" must be awaited`,
                      'error'
                    )
                  );
                }
              }
            }

            if (
              t.isMemberExpression(cp.node.callee) &&
              t.isIdentifier(cp.node.callee.property)
            ) {
              const m = cp.node.callee.property.name;
              if (
                m === 'toBeTruthy' ||
                m === 'toBeFalsy' ||
                m === 'toBeDefined' ||
                m === 'toBeUndefined'
              ) {
                weak++;
              }
              if (m === 'toMatchSnapshot' || m === 'toMatchInlineSnapshot') {
                hasAssertion = true;
              }
              if (m === 'then') floatingThen = true;
            }
          },
        });

        if (!hasAssertion) {
          issues.push(
            issue(
              filePath,
              line,
              'no-assertions',
              'assertion-quality',
              `Test "${title}" has no expect() / snapshot assertion`,
              'error'
            )
          );
        }
        if (expectCount > 15) {
          issues.push(
            issue(
              filePath,
              line,
              'too-many-asserts',
              'assertion-quality',
              `Test "${title}" has ${expectCount} assertions — split cases`,
              'warning'
            )
          );
        }
        if (weak >= 3) {
          issues.push(
            issue(
              filePath,
              line,
              'weak-matchers',
              'assertion-quality',
              `Test "${title}" overuses weak matchers (Truthy/Falsy/Defined)`,
              'warning'
            )
          );
        }
        if (cb.async && !hasAwait && floatingThen) {
          issues.push(
            issue(
              filePath,
              line,
              'floating-promise',
              'async-flake',
              `Async test "${title}" uses .then without await`,
              'warning'
            )
          );
        }
        if (conditionalExpect) {
          issues.push(
            issue(
              filePath,
              line,
              'conditional-expect',
              'conditional-logic',
              `Test "${title}" wraps expect() in conditionals — asserts may be skipped`,
              'warning'
            )
          );
        }
        if (emptyCatch) {
          issues.push(
            issue(
              filePath,
              line,
              'empty-catch',
              'conditional-logic',
              `Test "${title}" has an empty catch`,
              'warning'
            )
          );
        }
      },
      exit(p) {
        const name = calleeName(p.node.callee);
        const root = rootName(p.node.callee);
        if (!name || !root) return;
        if (DESCRIBE_ROOTS.has(root) || name.startsWith('describe.')) {
          describeDepth = Math.max(0, describeDepth - 1);
        }
      },
    },
  });

  // Date.now / Math.random
  if (/\bDate\.now\s*\(/.test(code) && !/jest\.spyOn\(\s*Date\s*,\s*['"]now['"]/.test(code)) {
    issues.push(
      issue(
        filePath,
        lineAt(code, code.search(/\bDate\.now\s*\(/)),
        'nondeterministic-date-now',
        'non-deterministic',
        'Date.now() without jest.spyOn(Date, "now") / fake timers',
        'warning'
      )
    );
  }
  if (
    /\bMath\.random\s*\(/.test(code) &&
    !/jest\.spyOn\(\s*Math\s*,\s*['"]random['"]/.test(code)
  ) {
    issues.push(
      issue(
        filePath,
        lineAt(code, code.search(/\bMath\.random\s*\(/)),
        'nondeterministic-random',
        'non-deterministic',
        'Math.random() without mocking — non-deterministic',
        'warning'
      )
    );
  }

  if (snapshotCount >= 8) {
    issues.push(
      issue(
        filePath,
        1,
        'snapshot-overuse',
        'snapshot-overuse',
        `${snapshotCount} snapshots in one file — prefer precise assertions`,
        'warning'
      )
    );
  }
  if (inlineSnapChars > 4000) {
    issues.push(
      issue(
        filePath,
        1,
        'snapshot-oversized',
        'snapshot-overuse',
        `Inline snapshots ~${inlineSnapChars} chars — oversized snapshots hide intent`,
        'warning'
      )
    );
  }

  const networkMocked =
    hasNetworkMockInfra ||
    [...mockedModules].some((m) =>
      /^(axios|node-fetch|got|superagent|fetch|@\/.*api)/.test(m)
    );
  if (networkCalls > 0 && !networkMocked) {
    issues.push(
      issue(
        filePath,
        1,
        'unmocked-network',
        'network-unmocked',
        'fetch/axios/http used without an obvious mock/MSW/nock — may call real APIs',
        'error'
      )
    );
  }

  if (testIdQueries >= 5 && testIdQueries > a11yQueries) {
    issues.push(
      issue(
        filePath,
        1,
        'rtl-testid-heavy',
        'rtl-antipattern',
        `Heavy ByTestId (${testIdQueries}) vs accessible queries (${a11yQueries})`,
        'warning'
      )
    );
  }

  if (
    /from\s+['"]next\/navigation['"]/.test(code) &&
    !hasMock(code, 'next/navigation')
  ) {
    issues.push(
      issue(
        filePath,
        1,
        'next-navigation-unmocked',
        'nextjs-hygiene',
        'next/navigation imported without jest.mock — common Jest/jsdom failure',
        'warning'
      )
    );
  }
  if (/from\s+['"]next\/router['"]/.test(code) && !hasMock(code, 'next/router')) {
    issues.push(
      issue(
        filePath,
        1,
        'next-router-unmocked',
        'nextjs-hygiene',
        'next/router imported without jest.mock',
        'warning'
      )
    );
  }
  if (/from\s+['"]next\/image['"]/.test(code) && !hasMock(code, 'next/image')) {
    issues.push(
      issue(
        filePath,
        1,
        'next-image-unmocked',
        'nextjs-hygiene',
        'next/image imported without a mock',
        'info'
      )
    );
  }

  for (const mod of mockedModules) {
    const c = mockCount(code, mod);
    if (c > 1) {
      issues.push(
        issue(
          filePath,
          1,
          'redundant-mock',
          'mocking-quality',
          `jest.mock("${mod}") appears ${c} times — redundant`,
          'warning'
        )
      );
    }
  }

  const sut = filePath
    .replace(/\.(test|spec)\.[^.]+$/, '')
    .replace(/\/__tests__\//, '/')
    .split(/[/\\]/)
    .pop();
  if (sut) {
    for (const mod of mockedModules) {
      if (mod.includes(sut) && !/\.(test|spec)/.test(mod)) {
        issues.push(
          issue(
            filePath,
            1,
            'mocking-system-under-test',
            'mocking-quality',
            `Possible mock of system under test ("${mod}")`,
            'warning'
          )
        );
      }
    }
  }

  if (
    /process\.env\.\w+\s*=/.test(code) &&
    !/afterEach|afterAll|jest\.replaceProperty/.test(code)
  ) {
    issues.push(
      issue(
        filePath,
        1,
        'env-mutation',
        'mocking-quality',
        'process.env mutated without obvious restore — order-dependent flakes',
        'info'
      )
    );
  }

  if (/localStorage\./.test(code) && !/localStorage\.clear/.test(code)) {
    issues.push(
      issue(
        filePath,
        1,
        'storage-leak',
        'mocking-quality',
        'localStorage used without clear — state may leak across tests',
        'info'
      )
    );
  }

  if (maxDescribeDepth >= 5) {
    issues.push(
      issue(
        filePath,
        1,
        'describe-too-deep',
        'readability',
        `describe() nesting depth ${maxDescribeDepth} — flatten for readability`,
        'info'
      )
    );
  }

  if (usesFakeTimers && !advancesTimers) {
    issues.push(
      issue(
        filePath,
        1,
        'fake-timers-no-advance',
        'timer-hygiene',
        'jest.useFakeTimers() without advancing timers',
        'warning'
      )
    );
  }
  if (usesFakeTimers && !restoresTimers) {
    issues.push(
      issue(
        filePath,
        1,
        'fake-timers-no-restore',
        'timer-hygiene',
        'Fake timers without useRealTimers/clearAllTimers restore',
        'info'
      )
    );
  }

  if (/\bfireEvent\./.test(code) && !/userEvent|@testing-library\/user-event/.test(code)) {
    issues.push(
      issue(
        filePath,
        1,
        'prefer-user-event',
        'rtl-antipattern',
        'fireEvent without user-event — prefer userEvent for realistic interactions',
        'info'
      )
    );
  }

  if (/toHaveClass\s*\(/.test(code)) {
    issues.push(
      issue(
        filePath,
        lineAt(code, code.search(/toHaveClass\s*\(/)),
        'brittle-classname-assert',
        'assertion-quality',
        'Asserting CSS class names is brittle — prefer roles/text/aria',
        'info'
      )
    );
  }

  return issues;
}
