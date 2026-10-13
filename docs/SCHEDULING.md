# Scheduled Report Generation — Design Proposal

**Status:** Not implemented in v1.0.0. Configuration schema is reserved in `.test-auditor.json`.

## Goal

Run `test-auditor` on a schedule, upload reports automatically, and avoid interactive prompts.

## Recommended approach: CI/CD scheduling (primary)

Use the platform scheduler rather than a background process in the npm package:

| Platform | Mechanism |
|----------|-----------|
| GitHub Actions | `cron:` workflow |
| GitLab CI | Pipeline schedules |
| Jenkins | Cron trigger |
| Azure DevOps | Scheduled pipelines |

**Why:** No daemon to maintain, works cross-platform, secrets stay in CI vaults, logs are centralized.

Example GitHub Actions:

```yaml
on:
  schedule:
    - cron: '0 9 * * 1'  # Monday 09:00 UTC
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run audit
```

Configure non-interactive flags in the npm script:

```json
{
  "scripts": {
    "audit": "test-auditor --path . --no-open --cms-readiness"
  }
}
```

Store `apiKey` in CI secrets or commit a protected `.test-auditor.json` only in private infra.

## Optional future: local `test-auditor schedule` command

If local scheduling is required:

1. **Do not** use npm `postinstall` / lifecycle hooks — unreliable and surprising.
2. **Prefer** a explicit CLI subcommand: `test-auditor schedule install` that writes a cron entry or systemd timer.
3. **Use** `node-cron` or OS `cron` — avoid a always-on Node daemon unless necessary.
4. **Timezone:** store IANA timezone in config (`Asia/Kolkata`); convert with `Intl` or `luxon` at schedule install time.
5. **Non-interactive:** read all options from `.test-auditor.json` (`cmsReadiness`, `upload`, flags).
6. **Duplicate prevention:** write lock file `/tmp/test-auditor-<project-hash>.lock` or check last-run timestamp in config.
7. **Failures:** append to `test-auditor-schedule.log` in project root; never log API keys.
8. **Windows:** document Task Scheduler export or recommend CI instead.

## Configuration schema (reserved)

```json
{
  "schedule": {
    "enabled": false,
    "frequency": "daily",
    "time": "09:00",
    "day": "monday",
    "timezone": "Asia/Kolkata"
  }
}
```

Validated by `validateScheduleConfig()` but not executed yet.

## Why not implement now

- CI scheduling covers most teams without new dependencies.
- Local daemons add support burden (Windows/macOS/Linux).
- CMS and upload flows must be fully non-interactive first (now supported via config + flags).
