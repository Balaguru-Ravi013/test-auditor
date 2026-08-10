// src/cmsPrompt.ts
import { select } from '@inquirer/prompts';
import type { CmsEntry, CmsRegistry } from './cmsRegistry.js';
import { resolveCmsPair } from './cmsRegistry.js';

export interface CmsSelection {
  from: CmsEntry;
  to: CmsEntry;
}

/**
 * Interactive dropdowns for Current CMS → New CMS.
 * Skips when stdin is not a TTY (caller should use flags instead).
 */
export async function promptCmsMigration(
  registry: CmsRegistry
): Promise<CmsSelection | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return null;
  }

  const choices = registry.cms.map((c) => ({
    name: `${c.displayName} (${c.id})`,
    value: c.id,
  }));

  const fromId = await select({
    message: 'Current CMS (source / legacy)',
    choices,
  });

  const toChoices = choices.filter((c) => c.value !== fromId);
  const toId = await select({
    message: 'New CMS (target)',
    choices: toChoices,
  });

  return resolveCmsPair(registry, fromId, toId);
}
