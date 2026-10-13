import fs from 'fs';
import path from 'path';

export const CONFIG_FILENAME = '.test-auditor.json';
export const LEGACY_CONFIG_FILENAME = 'test-auditor.config.json';

export interface ProjectRootResult {
  root: string;
  configFilePath: string;
}

/**
 * Walk upward from startDir until a Test Auditor config file is found.
 */
export function findProjectRoot(startDir: string = process.cwd()): ProjectRootResult | null {
  let current = path.resolve(startDir);
  const seen = new Set<string>();

  while (!seen.has(current)) {
    seen.add(current);

    for (const filename of [CONFIG_FILENAME, LEGACY_CONFIG_FILENAME]) {
      const configFilePath = path.join(current, filename);
      if (fs.existsSync(configFilePath)) {
        return { root: current, configFilePath };
      }
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}
