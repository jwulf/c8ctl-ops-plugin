# c8ctl-plugin-ops

High-level Camunda 8 **operations playbooks** for [`c8ctl`](https://github.com/camunda/c8ctl) — a clean-room, Apache-2.0 TypeScript reimplementation of the `ops` command group from [c8volt](https://github.com/grafvonb/c8volt).

Where `c8ctl` core gives you low-level, single-resource verbs (`list`, `get`, `create`, `cancel`, …), this plugin adds **multi-step, safety-first playbooks** that discover a scope, freeze it, show you a plan, and only then mutate — with dry-run previews, explicit confirmation, bounded concurrency, and structured audit reports.

## Install

```bash
c8ctl load plugin @nanobpm/c8ctl-plugin-ops         # from npm (once published)
c8ctl load plugin --from file:///path/to/c8ctl-ops-plugin   # from a local checkout
```

Then the `ops` command is available:

```bash
c8ctl ops --help
```

## Playbooks

| Command | What it does |
| --- | --- |
| `ops execute smoke-test` | Deploy an embedded fixture, start N instances, walk their families, then clean up — an end-to-end connectivity/health probe. |
| `ops execute retention-policy` | Delete **finished** process-instance families older than `--retention-days`. |
| `ops purge orphan-process-instances` | Find child instances whose parent no longer exists and delete their families. |
| `ops purge process-instances-with-incidents` | Delete the families of process instances that currently have incidents. |
| `ops purge all-process-definitions` | Delete process definitions (and, with `--force`, their running instances). |
| `ops repair incident` | Resolve incidents, optionally bumping job retries / timeout and setting variables first. |
| `ops repair process-instance` | Repair all active incidents scoped to selected process instances. |

Aliases are accepted for the resource, e.g. `ops purge orphans`, `ops execute retention`, `ops smoke-test`.

## Safety model

Every mutating playbook follows the same flow:

1. **Discover** the matching scope by paging the search APIs (`--batch-size` tunes page size; `--limit` caps the frozen scope, `0` = uncapped). Reports record whether discovery was *complete* or *user-limited*.
2. **Plan** — resolve process-instance families to their roots, compute the true affected scope, and detect any non-final/active instances.
3. **Preview / confirm** — `--dry-run` stops after the plan. Otherwise you are prompted before any mutation (bypass with `--auto-confirm` / `--automation` for CI).
4. **Execute** with bounded concurrency (`--workers`, `--no-worker-limit`, `--fail-fast`), then verify completion unless `--no-wait`.

Deleting a family that still contains non-final instances is **blocked** unless you pass `--force` (which cancels them first).

## Common flags

| Flag | Purpose |
| --- | --- |
| `--dry-run` | Preview the plan without mutating (global c8ctl flag). |
| `--json` | Emit the structured audit report as JSON (global c8ctl flag). |
| `--limit N` | Cap the frozen candidate scope (`0` = uncapped). |
| `--batch-size N` | Discovery page size (default 100). |
| `--auto-confirm` / `--automation` | Proceed without an interactive prompt. |
| `--force` | Cancel non-final/active instances before deleting. |
| `--no-wait` | Return once mutations are accepted, without confirming completion. |
| `--workers N` / `--no-worker-limit` / `--fail-fast` | Concurrency controls. |
| `--report-file PATH` / `--report-format markdown\|json` | Write an audit report. |

Playbook-specific selection flags include `--retention-days`, `--state`, `--incident-state`, `--bpmn-process-id`, `--pd-key`, `--pi-key`, `--parent-key`, `--error-type`, `--element-id`, `--latest`, `--key`, `--retries`, `--job-timeout-ms`, `--vars`, `--count`, and `--no-cleanup`. See `c8ctl ops --help` and each example below.

## Examples

```bash
# Preview an end-to-end smoke test (no mutations)
c8ctl ops execute smoke-test --dry-run

# Real smoke test: 5 instances, self-cleaning, non-interactive
c8ctl ops execute smoke-test -n 5 --auto-confirm

# Preview deletion of finished instances older than 30 days
c8ctl ops execute retention-policy --retention-days 30 --dry-run

# Delete instance families that have incidents (cancel non-final first)
c8ctl ops purge process-instances-with-incidents --force --auto-confirm

# Resolve matching incidents, bumping job retries to 3
c8ctl ops repair incident --error-type IO_MAPPING_ERROR --retries 3

# Set variables then resolve a process instance's incidents, writing an audit report
c8ctl ops repair process-instance --key 2251799813685249 \
  --vars '{"approved":true}' --report-file repair.md
```

> **Tip:** always start with `--dry-run`. The plan tells you the resolved roots, affected scope, and whether `--force` is required — before anything is deleted.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run lint        # biome check
npm run build       # esbuild bundle -> c8ctl-plugin.js
npm run test:unit   # node --test
npm test            # all of the above
```

The plugin entry point is the bundled `c8ctl-plugin.js` (declared as `main` in `package.json`); `src/` is bundled by esbuild with the SDK left external. See `AGENTS.md` for architecture.

## License

Apache-2.0. This is an independent clean-room reimplementation of c8volt's behavior; it shares no source with the GPL-licensed original. See `NOTICE`.
