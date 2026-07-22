// src/discovery.ts
import { glob } from 'glob';
import path from 'path';

export async function discoverTestFiles(projectPath: string): Promise<string[]> {
  const patterns = [
    '**/*.test.{js,jsx,ts,tsx}',
    '**/*.spec.{js,jsx,ts,tsx}',
    '**/__tests__/**/*.{js,jsx,ts,tsx}',
  ];

  const ignore = [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/coverage/**',
    '**/e2e/**',
    '**/cypress/**',
    '**/playwright/**',
    '**/*.e2e.{js,jsx,ts,tsx}',
    '**/*.pw.{js,jsx,ts,tsx}',
    '**/__tests__/e2e/**',
    '**/__tests__/regression/**',
  ];

  const results = await Promise.all(
    patterns.map((pattern) =>
      glob(pattern, { cwd: projectPath, ignore, absolute: true })
    )
  );

  return [...new Set(results.flat())]; // dedupe
}