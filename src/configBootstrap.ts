import { findProjectRoot } from './projectRoot.js';
import { loadEnvFromAncestors } from './envLoader.js';

export interface BootstrappedProjectConfig {
  projectRoot: string | null;
  configFilePath?: string;
  envFilePath?: string;
}

/**
 * Discover project configuration before resolving credentials.
 * 1. Walk upward for `.test-auditor.json`
 * 2. Walk upward for `.env` and apply Test Auditor variables
 */
export function bootstrapProjectConfiguration(
  startDir: string = process.cwd()
): BootstrappedProjectConfig {
  const project = findProjectRoot(startDir);
  const envFilePath = loadEnvFromAncestors(startDir);

  return {
    projectRoot: project?.root ?? null,
    ...(project?.configFilePath ? { configFilePath: project.configFilePath } : {}),
    ...(envFilePath ? { envFilePath } : {}),
  };
}
