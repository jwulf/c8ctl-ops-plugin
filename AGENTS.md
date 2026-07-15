# AGENTS.md — c8ctl-ops-plugin

Guidance for AI agents and contributors working in this repository.

## What this is

A `c8ctl` plugin that adds a single passthrough `ops` command exposing seven high-level Camunda 8 operations playbooks. It is a **clean-room, Apache-2.0** reimplementation of the `ops` group from the GPL-licensed [c8volt](https://github.com/grafvonb/c8volt) (Go). No c8volt source is copied; only observable behavior (command surface, flow, prompt strings, report schemas) is mirrored.

## Architecture

```
src/
  index.ts            Plugin entry: exports `commands.ops = { flags, handler }` and `metadata`.
  cli.ts              Flag coercion (Record<string,unknown> -> OpsFlags) and verb/resource routing.
  runtime.ts          Typed accessor for globalThis.c8ctl (host-injected runtime).
  engine/             Shared, declarative engine used by every playbook:
    api.ts            The ONLY place SDK calls live. C8Api façade + domain types + paging.
    context.ts        OpsContext + OpsFlags: api, dry-run/json/verbose, confirm(), emit(), workerCount().
    discovery.ts      discoverAll / discoverWhere — paged discovery with scope tracking.
    family.ts         Family (root + descendants) resolution and delete planning/execution.
    purge.ts          Shared delete step + non-final blocking used by the purge/retention playbooks.
    repair.ts         Shared incident-repair workflow used by both repair playbooks.
    pool.ts           determineWorkers + runPool (bounded concurrency, optional fail-fast).
    report.ts         baseReport / finalize / renderMarkdown (audit report envelope).
    types.ts          StepStatus, Outcome, DiscoveryScopeStatus, OpsReport, discoveryScope().
    util.ts           Small type-narrowing helpers (isRecord, str, num, unique, keyList, …).
  playbooks/          One file per playbook; thin orchestration over the engine.
  fixtures/           Embedded clean-room BPMN fixture for smoke-test (inlined as a TS string).
tests/unit/           node:test unit tests for pure helpers (no live cluster needed).
scripts/build.mjs     esbuild bundle: src/index.ts -> c8ctl-plugin.js (ESM, SDK external).
```

## Conventions

- **Style:** declarative/functional, matching c8ctl core. Prefer pure functions and small helpers; keep side effects (SDK calls, prompts, logging) in `api.ts` / `context.ts`.
- **Types:** strict TypeScript. `noExplicitAny` is a lint error. Avoid `as` casts except at the two deliberate structural boundaries (`runtime.ts`, `api.ts` client adaptation). Narrow `unknown` with `util.ts` helpers instead.
- **Every SDK call goes through `C8Api`** in `engine/api.ts`. Do not import the SDK elsewhere. Search endpoints take `(input, consistencyManagement)`; `get*` endpoints also require the consistency arg. Deployments use `createDeployment({ resources: File[] })`.
- **Playbook shape:** `startedAt` → `baseReport` → build `lines[]` → `emit = (outcome) => ctx.emit(finalize(report, outcome, startedAt), () => lines)` → discover → plan → dry-run/blocked/confirm branches → execute → `finalize`/`emit`. Mirror `playbooks/retention-policy.ts`.
- **Reports** are the source of truth: human output, `--json`, and `--report-file` markdown all derive from the same `OpsReport` object. Add new data as report sections, not ad-hoc logging.

## c8ctl plugin contract (important)

- The host **strips these global flags** from plugin argv before the handler runs: `help, version, profile, dry-run, verbose, fields, json, yes` (short `-h, -v, -y`). Read them via `globalThis.c8ctl` (`dryRun`, `outputMode==='json'`, `verbose`, `activeProfile`) — never declare them as plugin flags. All other flag names are free to use (`--limit`, `--batch-size`, etc. are fine post-c8ctl#373).
- Because `--yes`/`-y` is host-owned, non-interactive confirmation uses **`--auto-confirm` / `--automation`**.
- The handler receives `(args, flags, ctx)`. For the single `ops` command, `args = [verb, resource, ...rest]` (e.g. `['purge','orphan-process-instances']`). `flags` is keyed by the **declared (kebab-case)** flag names.
- Entry must be JS (`c8ctl-plugin.js`); Node won't strip TS inside `node_modules`, hence the esbuild bundle. `main` in `package.json` points at it.

## Validating changes

```bash
npm test    # typecheck + lint + build + unit tests
```

To exercise against a live cluster:

```bash
npm run build
c8ctl load plugin --from "file://$(pwd)"   # or: c8ctl sync plugin  (after a rebuild)
c8ctl ops execute smoke-test --dry-run
c8ctl ops execute smoke-test --auto-confirm -n 1   # real, self-cleaning
```

Note: some dev gateways do not implement `deleteProcessInstance` (HTTP 501) or `parentProcessInstanceKey` filtering; the playbooks surface these faithfully rather than masking them. Retention/definition purges assume Camunda 8.9+ semantics.

## License

Apache-2.0. Keep it clean-room: describe behavior in your own words; do not paste c8volt (GPL) source.
