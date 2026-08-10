// src/sourceDiscovery.ts
import { glob } from 'glob';
import path from 'path';

export type SourceKind =
  | 'page'
  | 'api'
  | 'component'
  | 'hook'
  | 'service'
  | 'util'
  | 'other';

export interface SourceFile {
  file: string;
  kind: SourceKind;
  /** Path relative to project root (posix-ish) */
  relative: string;
}

const IGNORE = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/e2e/**',
  '**/cypress/**',
  '**/playwright/**',
  '**/*.test.{js,jsx,ts,tsx}',
  '**/*.spec.{js,jsx,ts,tsx}',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/*.stories.{js,jsx,ts,tsx}',
  '**/*.story.{js,jsx,ts,tsx}',
  '**/*.d.ts',
  '**/next.config.*',
  '**/jest.config.*',
  '**/babel.config.*',
  '**/tailwind.config.*',
  '**/postcss.config.*',
  '**/middleware.{js,ts}',
];

/** Prefer high-signal app folders; fall back to broad src/ if present. */
const PATTERNS = [
  'app/**/*.{js,jsx,ts,tsx}',
  'pages/**/*.{js,jsx,ts,tsx}',
  'src/app/**/*.{js,jsx,ts,tsx}',
  'src/pages/**/*.{js,jsx,ts,tsx}',
  'src/components/**/*.{js,jsx,ts,tsx}',
  'components/**/*.{js,jsx,ts,tsx}',
  'src/hooks/**/*.{js,jsx,ts,tsx}',
  'hooks/**/*.{js,jsx,ts,tsx}',
  'src/lib/**/*.{js,jsx,ts,tsx}',
  'src/utils/**/*.{js,jsx,ts,tsx}',
  'src/services/**/*.{js,jsx,ts,tsx}',
  'src/api/**/*.{js,jsx,ts,tsx}',
  'lib/**/*.{js,jsx,ts,tsx}',
  'services/**/*.{js,jsx,ts,tsx}',
];

function classifyKind(relative: string): SourceKind {
  const r = relative.replace(/\\/g, '/').toLowerCase();
  const base = path.posix.basename(r);

  if (
    /(^|\/)(app|pages|src\/app|src\/pages)\/.*\/route\.(js|jsx|ts|tsx)$/.test(r) ||
    /(^|\/)(pages|src\/pages)\/api\//.test(r) ||
    /(^|\/)api\//.test(r)
  ) {
    return 'api';
  }

  if (
    /(^|\/)(app|src\/app)\//.test(r) &&
    /\/(page|layout|loading|error|not-found|template|default)\.(js|jsx|ts|tsx)$/.test(r)
  ) {
    return 'page';
  }

  if (/(^|\/)(pages|src\/pages)\//.test(r) && !/\/_app\./.test(r) && !/\/_document\./.test(r)) {
    return 'page';
  }

  if (/(^|\/)hooks?\//.test(r) || /^use[A-Z]/.test(base) || /\/use[A-Z][^/]*\./.test(r)) {
    return 'hook';
  }

  if (/(^|\/)(components?)\//.test(r)) {
    return 'component';
  }

  if (/(^|\/)(services?|api)\//.test(r)) {
    return 'service';
  }

  if (/(^|\/)(lib|utils?)\//.test(r)) {
    return 'util';
  }

  return 'other';
}

/**
 * Discover application source files (not tests) for gap analysis.
 */
export async function discoverSourceFiles(projectPath: string): Promise<SourceFile[]> {
  const results = await Promise.all(
    PATTERNS.map((pattern) =>
      glob(pattern, { cwd: projectPath, ignore: IGNORE, absolute: true, nodir: true })
    )
  );

  const unique = [...new Set(results.flat())];
  const files: SourceFile[] = [];

  for (const abs of unique) {
    const relative = path.relative(projectPath, abs).replace(/\\/g, '/');
    // Skip Next.js special boilerplate that rarely needs unit tests first
    if (/\/(_app|_document|_error)\.(js|jsx|ts|tsx)$/.test(relative)) continue;
    if (/\/layout\.(js|jsx|ts|tsx)$/.test(relative) && /\/(app|src\/app)\//.test(relative)) {
      // keep layouts — they can hide logic; still include
    }
    files.push({
      file: abs,
      kind: classifyKind(relative),
      relative,
    });
  }

  files.sort((a, b) => a.relative.localeCompare(b.relative));
  return files;
}
