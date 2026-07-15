// c8ctl-ops-plugin — generated bundle. Do not edit; edit src/ and run `npm run build`.

// src/engine/context.ts
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

// src/runtime.ts
function runtime() {
  const rt = globalThis.c8ctl;
  if (!rt) {
    throw new Error(
      "c8ctl runtime is not available. This plugin must be run through the c8ctl CLI."
    );
  }
  return rt;
}

// src/engine/util.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asRecord(value) {
  return isRecord(value) ? value : {};
}
function str(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return void 0;
}
function num(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : void 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : void 0;
  }
  return void 0;
}
function unique(keys) {
  return [...new Set(keys.filter((k) => k !== ""))];
}
function parseJsonObject(value, name) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`--${name} must be valid JSON`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`--${name} must be a JSON object`);
  }
  return parsed;
}
function keyList(value) {
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  }
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === "string" && v.length > 0);
  }
  return [];
}

// src/engine/api.ts
var NO_WAIT_CONSISTENCY = { consistency: { waitUpToMs: 0 } };
function pageOf(raw, map) {
  const rec = asRecord(raw);
  const rawItems = Array.isArray(rec.items) ? rec.items : [];
  const items = rawItems.map((it) => map(asRecord(it)));
  const pageMeta = asRecord(rec.page);
  const endCursor = str(pageMeta.endCursor);
  const totalItems = num(pageMeta.totalItems) ?? items.length;
  const hasMore = pageMeta.hasMoreTotalItems === true;
  return { items, endCursor, totalItems, hasMore };
}
function mapProcessInstance(r) {
  return {
    processInstanceKey: str(r.processInstanceKey) ?? "",
    processDefinitionKey: str(r.processDefinitionKey),
    processDefinitionId: str(r.processDefinitionId),
    processDefinitionVersion: num(r.processDefinitionVersion),
    state: str(r.state),
    parentProcessInstanceKey: str(r.parentProcessInstanceKey),
    startDate: str(r.startDate),
    endDate: str(r.endDate),
    hasIncident: r.hasIncident === true,
    tenantId: str(r.tenantId)
  };
}
function mapIncident(r) {
  return {
    incidentKey: str(r.incidentKey) ?? "",
    processInstanceKey: str(r.processInstanceKey),
    processDefinitionKey: str(r.processDefinitionKey),
    processDefinitionId: str(r.processDefinitionId),
    errorType: str(r.errorType),
    errorMessage: str(r.errorMessage),
    state: str(r.state),
    jobKey: str(r.jobKey),
    elementId: str(r.elementId),
    elementInstanceKey: str(r.elementInstanceKey),
    creationTime: str(r.creationTime),
    tenantId: str(r.tenantId)
  };
}
function mapProcessDefinition(r) {
  return {
    processDefinitionKey: str(r.processDefinitionKey) ?? "",
    processDefinitionId: str(r.processDefinitionId),
    name: str(r.name),
    version: num(r.version),
    versionTag: str(r.versionTag),
    resourceName: str(r.resourceName),
    tenantId: str(r.tenantId)
  };
}
function pruneFilter(filter) {
  const out = {};
  for (const [k, v] of Object.entries(filter)) {
    if (v !== void 0) out[k] = v;
  }
  return out;
}
var C8Api = class {
  sdk;
  constructor(client) {
    this.sdk = client;
  }
  async getTopology() {
    return asRecord(await this.sdk.getTopology());
  }
  async searchProcessInstancesPage(filter, limit, after) {
    const input = {
      filter: pruneFilter({ ...filter }),
      page: { limit, ...after ? { after } : {} }
    };
    return pageOf(
      await this.sdk.searchProcessInstances(input, NO_WAIT_CONSISTENCY),
      mapProcessInstance
    );
  }
  async searchIncidentsPage(filter, limit, after) {
    const input = {
      filter: pruneFilter({ ...filter }),
      page: { limit, ...after ? { after } : {} }
    };
    return pageOf(await this.sdk.searchIncidents(input, NO_WAIT_CONSISTENCY), mapIncident);
  }
  async searchProcessDefinitionsPage(filter, limit, after) {
    const input = {
      filter: pruneFilter({ ...filter }),
      page: { limit, ...after ? { after } : {} }
    };
    return pageOf(
      await this.sdk.searchProcessDefinitions(input, NO_WAIT_CONSISTENCY),
      mapProcessDefinition
    );
  }
  async getProcessInstance(key) {
    try {
      const raw = await this.sdk.getProcessInstance(
        { processInstanceKey: key },
        NO_WAIT_CONSISTENCY
      );
      return mapProcessInstance(asRecord(raw));
    } catch (err) {
      if (isNotFound(err)) return void 0;
      throw err;
    }
  }
  /** Direct children of a process instance (via parent-key search). */
  async childrenOf(key) {
    const out = [];
    let after;
    do {
      const page = await this.searchProcessInstancesPage(
        { parentProcessInstanceKey: key },
        100,
        after
      );
      out.push(...page.items);
      after = page.hasMore ? page.endCursor : void 0;
    } while (after);
    return out;
  }
  async incidentsForProcessInstance(key, state) {
    const out = [];
    let after;
    do {
      const page = await this.searchIncidentsPage(
        { processInstanceKey: key, ...state ? { state } : {} },
        100,
        after
      );
      out.push(...page.items);
      after = page.hasMore ? page.endCursor : void 0;
    } while (after);
    return out;
  }
  cancelProcessInstance(key) {
    return this.sdk.cancelProcessInstance({ processInstanceKey: key });
  }
  deleteProcessInstance(key) {
    return this.sdk.deleteProcessInstance({ processInstanceKey: key });
  }
  resolveIncident(key) {
    return this.sdk.resolveIncident({ incidentKey: key });
  }
  updateJob(jobKey, changeset) {
    return this.sdk.updateJob({ jobKey, changeset });
  }
  setProcessInstanceVariables(processInstanceKey, variables) {
    return this.sdk.createElementInstanceVariables({
      elementInstanceKey: processInstanceKey,
      variables
    });
  }
  async createProcessInstance(input) {
    const raw = asRecord(await this.sdk.createProcessInstance(input));
    return mapProcessInstance(raw);
  }
  async deployResource(name, xml) {
    const file = new File([xml], name, { type: "text/xml" });
    const raw = asRecord(await this.sdk.createDeployment({ resources: [file] }));
    const deployments = Array.isArray(raw.deployments) ? raw.deployments : [];
    for (const entry of deployments) {
      const rec = asRecord(entry);
      const pd = asRecord(rec.processDefinition ?? rec);
      const key = str(pd.processDefinitionKey);
      if (key) {
        return { processDefinitionKey: key, processDefinitionId: str(pd.processDefinitionId), raw };
      }
    }
    return { raw };
  }
  deleteResource(resourceKey) {
    return this.sdk.deleteResource({ resourceKey });
  }
};
function isNotFound(err) {
  const rec = asRecord(err);
  const status = num(rec.status) ?? num(rec.statusCode) ?? num(asRecord(rec.response).status);
  if (status === 404) return true;
  const message = err instanceof Error ? err.message : str(rec.message) ?? "";
  return /\b404\b|not found/i.test(message);
}
function isTerminal(state) {
  return state === "COMPLETED" || state === "TERMINATED";
}

// src/engine/pool.ts
import { availableParallelism } from "node:os";
function determineWorkers(itemCount, wanted, noWorkerLimit) {
  if (itemCount <= 0) return 1;
  if (wanted !== void 0 && wanted > 0) return Math.min(wanted, itemCount);
  if (noWorkerLimit) return itemCount;
  const cpus = Math.max(1, availableParallelism());
  const cap = Math.min(2 * cpus, 32);
  return Math.max(1, Math.min(itemCount, cap));
}
async function runPool(items, options, worker) {
  const results = items.map((item) => ({ item }));
  if (items.length === 0) return results;
  const concurrency = Math.max(1, Math.min(options.workers, items.length));
  let next = 0;
  let aborted = false;
  async function pump() {
    while (!aborted) {
      const index = next++;
      if (index >= items.length) return;
      const item = items[index];
      if (item === void 0) return;
      try {
        results[index] = { item, value: await worker(item, index) };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        results[index] = { item, error };
        if (options.failFast) {
          aborted = true;
          return;
        }
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => pump()));
  return results;
}

// src/engine/report.ts
function baseReport(ctx, {
  schemaVersion,
  command,
  startedAt
}) {
  const now = Date.now();
  return {
    schemaVersion,
    command,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(now).toISOString(),
    durationMs: now - startedAt,
    dryRun: ctx.dryRun,
    autoConfirm: ctx.flags.autoConfirm,
    automation: ctx.flags.automation,
    noWait: ctx.flags.noWait,
    force: ctx.flags.force,
    profile: ctx.profile,
    tenantId: ctx.tenantId,
    outcome: "planned",
    errors: [],
    notices: []
  };
}
function finalize(report, outcome, startedAt) {
  const now = Date.now();
  report.outcome = outcome;
  report.finishedAt = new Date(now).toISOString();
  report.durationMs = now - startedAt;
  return report;
}
var META_KEYS = [
  "command",
  "outcome",
  "dryRun",
  "schemaVersion",
  "startedAt",
  "finishedAt",
  "durationMs",
  "profile",
  "tenantId",
  "autoConfirm",
  "automation",
  "noWait",
  "force"
];
function renderMarkdown(report) {
  const lines = [];
  lines.push(`# ${title(report.command)}`);
  lines.push("");
  lines.push("## Run");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("| --- | --- |");
  for (const key of META_KEYS) {
    const value = report[key];
    if (value === void 0) continue;
    lines.push(`| ${key} | ${inline(value)} |`);
  }
  lines.push("");
  for (const [key, value] of Object.entries(report)) {
    if (META_KEYS.includes(key)) continue;
    if (key === "errors" || key === "notices") continue;
    if (value === void 0) continue;
    lines.push(`## ${humanize(key)}`);
    lines.push("");
    renderSection(lines, value);
    lines.push("");
  }
  renderList(lines, "Notices", report.notices);
  renderList(lines, "Errors", report.errors);
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}
`;
}
function renderList(lines, heading, value) {
  if (!Array.isArray(value) || value.length === 0) return;
  lines.push(`## ${heading}`);
  lines.push("");
  for (const item of value) lines.push(`- ${inline(item)}`);
  lines.push("");
}
function renderSection(lines, value) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push("_none_");
      return;
    }
    if (value.every((v) => !isRecord(v))) {
      for (const item of value) lines.push(`- ${inline(item)}`);
      return;
    }
    renderTable(lines, value.filter(isRecord));
    return;
  }
  if (isRecord(value)) {
    lines.push("| Field | Value |");
    lines.push("| --- | --- |");
    for (const [k, v] of Object.entries(value)) {
      if (v === void 0) continue;
      lines.push(`| ${humanize(k)} | ${inline(v)} |`);
    }
    return;
  }
  lines.push(inline(value));
}
function renderTable(lines, rows) {
  const columns = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  if (columns.length === 0) {
    lines.push("_none_");
    return;
  }
  lines.push(`| ${columns.join(" | ")} |`);
  lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    lines.push(`| ${columns.map((c) => inline(row[c])).join(" | ")} |`);
  }
}
function inline(value) {
  if (value === void 0 || value === null) return "";
  if (Array.isArray(value)) {
    if (value.length === 0) return "_none_";
    return value.map((v) => inline(v)).join(", ");
  }
  if (isRecord(value)) return JSON.stringify(value);
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}
function humanize(key) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
function title(command) {
  return `${command} \u2014 audit report`;
}

// src/engine/context.ts
var OpsContext = class {
  api;
  logger;
  flags;
  dryRun;
  json;
  verbose;
  profile;
  tenantId;
  constructor(flags2) {
    const rt = runtime();
    this.flags = flags2;
    this.api = new C8Api(rt.createClient(rt.activeProfile));
    this.logger = rt.getLogger();
    this.dryRun = rt.dryRun === true;
    this.json = rt.outputMode === "json";
    this.verbose = rt.verbose === true;
    this.profile = rt.activeProfile;
    this.tenantId = safeTenant(rt);
  }
  /** Human-facing progress line (suppressed in JSON mode). */
  progress(message) {
    if (!this.json) this.logger.info(message);
  }
  /** Whether confirmation is implicitly granted (no prompt needed). */
  get implicitlyConfirmed() {
    return this.flags.autoConfirm || this.flags.automation;
  }
  /**
   * Ask the user to confirm a mutation. Returns true when confirmed. In
   * automation / auto-confirm mode returns true without prompting. In a
   * non-interactive session without those flags it throws, so unattended runs
   * fail clearly instead of hanging on a prompt.
   */
  async confirm(prompt) {
    if (this.implicitlyConfirmed) return true;
    if (!process.stdin.isTTY) {
      throw new Error(
        `${prompt}
Refusing to prompt in a non-interactive session. Re-run with --auto-confirm or --automation, or preview with --dry-run.`
      );
    }
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
      const answer = await new Promise((resolve) => {
        rl.question(`${prompt} [y/N] `, resolve);
      });
      return /^y(es)?$/i.test(answer.trim());
    } finally {
      rl.close();
    }
  }
  /**
   * Emit the final result: a JSON payload in JSON mode, otherwise a
   * human-rendered summary. Writes an audit report file when --report-file is
   * set. `human` renders the text summary lines.
   */
  async emit(report, human) {
    if (this.flags.reportFile) {
      await this.writeReport(report);
    }
    if (this.json) {
      this.logger.json(report);
      return;
    }
    for (const line of human(report)) {
      this.logger.info(line);
    }
    if (this.flags.reportFile) {
      this.logger.info(`report written: ${this.flags.reportFile}`);
    }
  }
  async writeReport(report) {
    const path = this.flags.reportFile;
    if (!path) return;
    const format = this.flags.reportFormat ?? inferFormat(path);
    const content = format === "json" ? `${JSON.stringify(report, null, 2)}
` : renderMarkdown(report);
    await writeFile(path, content, "utf-8");
  }
  workerCount(itemCount) {
    return determineWorkers(itemCount, this.flags.workers, this.flags.noWorkerLimit);
  }
};
function inferFormat(path) {
  return /\.json$/i.test(path) ? "json" : "markdown";
}
function safeTenant(rt) {
  try {
    return rt.resolveTenantId(rt.activeProfile);
  } catch {
    return "<default>";
  }
}

// src/engine/types.ts
function discoveryScope(seen, frozen, pages, limit, batchSize) {
  const limited = limit > 0 && frozen >= limit && seen >= frozen;
  return {
    complete: !limited,
    limited,
    limit,
    batchSize,
    pages,
    candidatesSeen: seen,
    candidatesFrozen: frozen
  };
}
function describeScope(scope) {
  if (scope.limited) {
    return `discovery user-limited: limit ${scope.limit}; pages ${scope.pages}; batch size ${scope.batchSize}`;
  }
  return `discovery complete: pages ${scope.pages}; batch size ${scope.batchSize}`;
}

// src/engine/discovery.ts
async function discoverAll(fetchPage, { limit, batchSize }) {
  const items = [];
  let after;
  let pages = 0;
  let seen = 0;
  const seenCursors = /* @__PURE__ */ new Set();
  for (; ; ) {
    const remaining = limit > 0 ? limit - items.length : batchSize;
    const pageLimit = limit > 0 ? Math.max(1, Math.min(batchSize, remaining)) : batchSize;
    const page = await fetchPage(pageLimit, after);
    pages++;
    seen += page.items.length;
    for (const item of page.items) {
      items.push(item);
      if (limit > 0 && items.length >= limit) break;
    }
    if (limit > 0 && items.length >= limit) break;
    if (!page.hasMore || !page.endCursor) break;
    if (seenCursors.has(page.endCursor)) break;
    seenCursors.add(page.endCursor);
    after = page.endCursor;
  }
  return {
    items,
    scope: discoveryScope(seen, items.length, pages, limit, batchSize)
  };
}
async function discoverWhere(fetchPage, predicate, { limit, batchSize }) {
  const items = [];
  let after;
  let pages = 0;
  let seen = 0;
  const seenCursors = /* @__PURE__ */ new Set();
  for (; ; ) {
    const page = await fetchPage(batchSize, after);
    pages++;
    seen += page.items.length;
    for (const item of page.items) {
      if (await predicate(item)) {
        items.push(item);
        if (limit > 0 && items.length >= limit) break;
      }
    }
    if (limit > 0 && items.length >= limit) break;
    if (!page.hasMore || !page.endCursor) break;
    if (seenCursors.has(page.endCursor)) break;
    seenCursors.add(page.endCursor);
    after = page.endCursor;
  }
  return {
    items,
    scope: discoveryScope(seen, items.length, pages, limit, batchSize)
  };
}

// src/playbooks/purge-definitions.ts
var SCHEMA = "ops.all-process-definitions.v1";
var COMMAND = "ops purge all-process-definitions";
async function run(ctx) {
  const startedAt = Date.now();
  const report = baseReport(ctx, { schemaVersion: SCHEMA, command: COMMAND, startedAt });
  const lines = [];
  const emit = (outcome2) => ctx.emit(finalize(report, outcome2, startedAt), () => lines);
  lines.push(
    ctx.dryRun ? "dry run: purge all-process-definitions" : "purge all-process-definitions"
  );
  const definitions = await discoverDefinitions(ctx);
  const candidateKeys = unique(definitions.items.map((d) => d.processDefinitionKey));
  report.discovery = {
    filters: definitionFilter(ctx),
    latestOnly: ctx.flags.raw.latest === true,
    candidateProcessDefinitionCount: candidateKeys.length,
    scope: definitions.scope,
    candidateProcessDefinitionKeys: candidateKeys
  };
  lines.push(`process-definition candidates: ${candidateKeys.length}`);
  if (definitions.scope.limited || ctx.verbose) lines.push(describeScope(definitions.scope));
  if (candidateKeys.length === 0) {
    report.deletePlan = { status: "skipped" };
    report.deletion = { status: "skipped" };
    report.notices.push("no process definitions found");
    lines.push("outcome: planned");
    await emit("planned");
    return;
  }
  const impacts = await planImpact(
    ctx.api,
    definitions.items,
    ctx.workerCount(candidateKeys.length)
  );
  const activeCount = impacts.reduce((n, i) => n + i.activeProcessInstanceKeys.length, 0);
  const affectedCount = impacts.reduce((n, i) => n + i.affectedProcessInstanceCount, 0);
  const requiresForce = !ctx.flags.force && activeCount > 0;
  report.deletePlan = {
    status: "planned",
    candidateProcessDefinitionCount: candidateKeys.length,
    activeProcessInstanceCount: activeCount,
    affectedProcessInstanceCount: affectedCount,
    requiresForce,
    items: impacts
  };
  const verb = ctx.dryRun ? "would be" : "will be";
  lines.push(
    `delete preview: ${candidateKeys.length} process definition(s), ${affectedCount} affected process instance(s) (${activeCount} active) ${verb} deleted`
  );
  if (activeCount > 0) {
    lines.push(`active process instances: ${activeCount} (use --force to cancel before delete)`);
  }
  if (ctx.dryRun) {
    report.deletion = { status: "skipped" };
    lines.push("outcome: planned");
    await emit("planned");
    return;
  }
  if (requiresForce) {
    const message = `refusing to delete all-process-definitions purge scope: ${activeCount} active process instance(s) are affected; no delete request was submitted; use --force to cancel active process instances before delete`;
    report.deletion = { status: "blocked", errors: [message] };
    report.errors.push(message);
    lines.push(`blocked: ${message}`);
    lines.push("outcome: failed");
    await emit("failed");
    return;
  }
  if (!await ctx.confirm(confirmationPrompt(candidateKeys.length, activeCount, affectedCount))) {
    report.deletion = { status: "skipped" };
    report.notices.push("aborted by user");
    lines.push("aborted by user");
    await emit("planned");
    return;
  }
  const items = await executeDelete(ctx, impacts);
  const errors = items.filter((i) => i.error).map((i) => `${i.processDefinitionKey}: ${i.error}`);
  const deleted = items.filter((i) => i.deleted).length;
  report.deletion = {
    status: errors.length > 0 ? "failed" : ctx.flags.noWait ? "submitted" : "confirmed",
    submittedProcessDefinitionKeys: candidateKeys,
    items,
    submitted: items.length > 0,
    confirmed: errors.length === 0 && !ctx.flags.noWait,
    noWait: ctx.flags.noWait,
    errors
  };
  if (errors.length > 0) report.errors.push(...errors);
  const outcome = errors.length > 0 ? deleted > 0 ? "partial" : "failed" : "executed";
  lines.push(
    `deleted: ${deleted}/${candidateKeys.length} definition(s)${ctx.flags.noWait ? " (submitted, not awaited)" : ""}`
  );
  lines.push(`outcome: ${outcome}`);
  await emit(outcome);
}
function definitionFilter(ctx) {
  return {
    ...str(ctx.flags.raw.bpmnProcessId) ? { processDefinitionId: str(ctx.flags.raw.bpmnProcessId) } : {},
    ...ctx.flags.raw.latest === true ? { isLatestVersion: true } : {}
  };
}
async function discoverDefinitions(ctx) {
  const key = str(ctx.flags.raw.pdKey);
  if (key) {
    const page = await ctx.api.searchProcessDefinitionsPage({ processDefinitionKey: key }, 1);
    return {
      items: page.items,
      scope: {
        complete: true,
        limited: false,
        limit: ctx.flags.limit,
        batchSize: ctx.flags.batchSize,
        pages: 1,
        candidatesSeen: page.items.length,
        candidatesFrozen: page.items.length
      }
    };
  }
  return discoverAll(
    (limit, after) => ctx.api.searchProcessDefinitionsPage(definitionFilter(ctx), limit, after),
    { limit: ctx.flags.limit, batchSize: ctx.flags.batchSize }
  );
}
async function planImpact(api, definitions, workers) {
  const results = await runPool(definitions, { workers, failFast: false }, async (def) => {
    const instances = await collectInstances(api, def.processDefinitionKey);
    const active = instances.filter((pi) => !isTerminal(pi.state)).map((pi) => pi.processInstanceKey);
    return {
      processDefinitionKey: def.processDefinitionKey,
      processDefinitionId: def.processDefinitionId,
      version: def.version,
      affectedProcessInstanceCount: instances.length,
      activeProcessInstanceKeys: active
    };
  });
  return results.map(
    (r) => r.value ?? {
      processDefinitionKey: r.item.processDefinitionKey,
      affectedProcessInstanceCount: 0,
      activeProcessInstanceKeys: []
    }
  );
}
async function collectInstances(api, processDefinitionKey) {
  const result = await discoverAll(
    (limit, after) => api.searchProcessInstancesPage({ processDefinitionKey }, limit, after),
    { limit: 0, batchSize: 100 }
  );
  return result.items;
}
async function executeDelete(ctx, impacts) {
  const workers = ctx.workerCount(impacts.length);
  const results = await runPool(
    impacts,
    { workers, failFast: ctx.flags.failFast },
    async (impact) => {
      const item = {
        processDefinitionKey: impact.processDefinitionKey,
        canceledInstances: 0,
        deleted: false
      };
      if (ctx.flags.force && impact.activeProcessInstanceKeys.length > 0) {
        for (const key of impact.activeProcessInstanceKeys) {
          await ctx.api.cancelProcessInstance(key);
          item.canceledInstances++;
        }
      }
      await ctx.api.deleteResource(impact.processDefinitionKey);
      item.deleted = true;
      return item;
    }
  );
  return results.map(
    (r) => r.value ?? {
      processDefinitionKey: r.item.processDefinitionKey,
      canceledInstances: 0,
      deleted: false,
      error: r.error?.message
    }
  );
}
function confirmationPrompt(defs, active, affected) {
  return `process-definition purge: ${defs} process definition(s), ${affected} affected process instance(s) (${active} active) will be deleted. Do you want to proceed?`;
}

// src/engine/family.ts
var MAX_DEPTH = 1e3;
async function resolveAncestry(api, startKey) {
  let currentKey = startKey;
  let current = await api.getProcessInstance(currentKey);
  if (!current) {
    return { startKey, rootKey: startKey, orphaned: true, missingAncestor: startKey };
  }
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const parentKey = current.parentProcessInstanceKey;
    if (!parentKey) {
      return { startKey, rootKey: currentKey, root: current, orphaned: false };
    }
    const parent = await api.getProcessInstance(parentKey);
    if (!parent) {
      return {
        startKey,
        rootKey: currentKey,
        root: current,
        orphaned: true,
        missingAncestor: parentKey
      };
    }
    currentKey = parentKey;
    current = parent;
  }
  return { startKey, rootKey: currentKey, root: current, orphaned: false };
}
async function collectDescendants(api, rootKey) {
  const root = await api.getProcessInstance(rootKey);
  const collected = root ? [root] : [{ processInstanceKey: rootKey }];
  const seen = /* @__PURE__ */ new Set([rootKey]);
  const queue = [rootKey];
  while (queue.length > 0) {
    const key = queue.shift();
    if (key === void 0) break;
    const children = await api.childrenOf(key);
    for (const child of children) {
      if (seen.has(child.processInstanceKey)) continue;
      seen.add(child.processInstanceKey);
      collected.push(child);
      queue.push(child.processInstanceKey);
    }
  }
  return collected;
}
async function planFamilyDelete(api, seedKeys, {
  workers,
  failFast,
  includeNonFinalRoots
}) {
  const seeds = unique(seedKeys);
  const ancestryResults = await runPool(
    seeds,
    { workers, failFast },
    (key) => resolveAncestry(api, key)
  );
  const roots = [];
  const skippedSeedKeys = [];
  const missingAncestors = [];
  const seenRoots = /* @__PURE__ */ new Set();
  const duplicateRootKeys = [];
  for (const r of ancestryResults) {
    if (r.error || !r.value) continue;
    const a = r.value;
    if (a.missingAncestor) missingAncestors.push(a.missingAncestor);
    const rootTerminal = isTerminal(a.root?.state);
    if (!includeNonFinalRoots && !rootTerminal) {
      skippedSeedKeys.push(a.startKey);
      continue;
    }
    if (seenRoots.has(a.rootKey)) {
      duplicateRootKeys.push(a.rootKey);
      continue;
    }
    seenRoots.add(a.rootKey);
    roots.push(a.rootKey);
  }
  const descendantResults = await runPool(
    roots,
    { workers, failFast },
    (rootKey) => collectDescendants(api, rootKey)
  );
  const affected = [];
  const affectedSeen = /* @__PURE__ */ new Set();
  for (const r of descendantResults) {
    for (const pi of r.value ?? []) {
      if (affectedSeen.has(pi.processInstanceKey)) continue;
      affectedSeen.add(pi.processInstanceKey);
      affected.push(pi);
    }
  }
  const nonFinalAffectedKeys = affected.filter((pi) => !isTerminal(pi.state)).map((pi) => pi.processInstanceKey);
  const finalStateKeys = affected.filter((pi) => isTerminal(pi.state)).map((pi) => pi.processInstanceKey);
  return {
    seedKeys: seeds,
    resolvedRootKeys: unique(roots),
    affectedKeys: affected.map((pi) => pi.processInstanceKey),
    duplicateRootKeys: unique(duplicateRootKeys),
    finalStateKeys,
    nonFinalAffectedKeys,
    skippedSeedKeys: unique(skippedSeedKeys),
    missingAncestors: unique(missingAncestors),
    requiresCancelBeforeDelete: nonFinalAffectedKeys.length > 0
  };
}
async function executeFamilyDelete(api, plan, { workers, failFast, force }) {
  const nonFinal = new Set(plan.nonFinalAffectedKeys);
  const results = await runPool(plan.resolvedRootKeys, { workers, failFast }, async (rootKey) => {
    const report = { rootKey, canceled: false, deleted: false };
    if (force && nonFinal.has(rootKey)) {
      await api.cancelProcessInstance(rootKey);
      report.canceled = true;
    }
    await api.deleteProcessInstance(rootKey);
    report.deleted = true;
    return report;
  });
  return results.map(
    (r) => r.value ?? { rootKey: r.item, canceled: false, deleted: false, error: r.error?.message }
  );
}

// src/engine/purge.ts
function blockedByNonFinal(plan, force) {
  return plan.requiresCancelBeforeDelete && !force;
}
function blockedMessage(plan) {
  return `refusing to delete process-instance scope: ${plan.nonFinalAffectedKeys.length} non-final affected process instance(s); no delete request was submitted; use --force to cancel the non-final affected scope before delete`;
}
async function runDelete(ctx, plan) {
  const workers = ctx.workerCount(plan.resolvedRootKeys.length);
  const items = await executeFamilyDelete(ctx.api, plan, {
    workers,
    failFast: ctx.flags.failFast,
    force: ctx.flags.force
  });
  const errors = items.filter((i) => i.error).map((i) => `${i.rootKey}: ${i.error}`);
  const hadError = errors.length > 0;
  const confirmed = !hadError && !ctx.flags.noWait && items.every((i) => i.deleted);
  let status;
  if (hadError) status = "failed";
  else if (ctx.flags.noWait) status = "submitted";
  else status = "confirmed";
  return {
    status,
    submittedRootKeys: plan.resolvedRootKeys,
    items,
    submitted: items.length > 0,
    confirmed,
    noWait: ctx.flags.noWait,
    errors
  };
}

// src/playbooks/purge-incidents.ts
var SCHEMA2 = "ops.process-instances-with-incidents.v1";
var COMMAND2 = "ops purge process-instances-with-incidents";
async function run2(ctx) {
  const startedAt = Date.now();
  const report = baseReport(ctx, { schemaVersion: SCHEMA2, command: COMMAND2, startedAt });
  const lines = [];
  const emit = (outcome2) => ctx.emit(finalize(report, outcome2, startedAt), () => lines);
  const state = str(ctx.flags.raw.incidentState) ?? "ACTIVE";
  const filter = {
    ...state && state !== "all" ? { state: state.toUpperCase() } : {},
    ...str(ctx.flags.raw.errorType) ? { errorType: str(ctx.flags.raw.errorType) } : {},
    ...str(ctx.flags.raw.bpmnProcessId) ? { processDefinitionId: str(ctx.flags.raw.bpmnProcessId) } : {},
    ...str(ctx.flags.raw.pdKey) ? { processDefinitionKey: str(ctx.flags.raw.pdKey) } : {}
  };
  lines.push(
    ctx.dryRun ? "dry run: purge process-instances-with-incidents" : "purge process-instances-with-incidents"
  );
  const discovery = await discoverAll(
    (limit, after) => ctx.api.searchIncidentsPage(filter, limit, after),
    { limit: ctx.flags.limit, batchSize: ctx.flags.batchSize }
  );
  const incidentKeys = discovery.items.map((i) => i.incidentKey);
  const missingPi = discovery.items.filter((i) => !i.processInstanceKey).length;
  const seedKeys = unique(
    discovery.items.map((i) => i.processInstanceKey).filter((k) => typeof k === "string" && k.length > 0)
  );
  report.discovery = {
    filters: filter,
    incidentCount: incidentKeys.length,
    candidateProcessInstanceCount: seedKeys.length,
    incidentsWithoutProcessInstance: missingPi,
    scope: discovery.scope,
    incidentKeys,
    seedKeys
  };
  lines.push(`incidents: ${incidentKeys.length}; candidate process instances: ${seedKeys.length}`);
  if (missingPi > 0) {
    report.notices.push(`${missingPi} incident(s) skipped: no process-instance key`);
    lines.push(`skipped ${missingPi} incident(s) with no process-instance key`);
  }
  if (discovery.scope.limited || ctx.verbose) lines.push(describeScope(discovery.scope));
  if (seedKeys.length === 0) {
    report.deletePlan = { status: "skipped" };
    report.deletion = { status: "skipped" };
    report.notices.push("no process instances with incidents found");
    lines.push("outcome: planned");
    await emit("planned");
    return;
  }
  const plan = await planFamilyDelete(ctx.api, seedKeys, {
    workers: ctx.workerCount(seedKeys.length),
    failFast: ctx.flags.failFast,
    includeNonFinalRoots: true
  });
  report.deletePlan = { status: "planned", ...plan };
  renderPlanLine(lines, ctx, plan);
  if (ctx.dryRun) {
    report.deletion = { status: "skipped" };
    lines.push("outcome: planned");
    await emit("planned");
    return;
  }
  if (blockedByNonFinal(plan, ctx.flags.force)) {
    const message = blockedMessage(plan);
    report.deletion = { status: "blocked", errors: [message] };
    report.errors.push(message);
    lines.push(`blocked: ${message}`);
    lines.push("outcome: failed");
    await emit("failed");
    return;
  }
  if (!await ctx.confirm(confirmationPrompt2(plan))) {
    report.deletion = { status: "skipped" };
    report.notices.push("aborted by user");
    lines.push("aborted by user");
    await emit("planned");
    return;
  }
  const deletion = await runDelete(ctx, plan);
  report.deletion = deletion;
  const outcome = deletion.errors.length > 0 ? "partial" : "executed";
  lines.push(
    `deleted: ${deletion.items.filter((i) => i.deleted).length}/${deletion.submittedRootKeys.length} root(s)${deletion.noWait ? " (submitted, not awaited)" : ""}`
  );
  lines.push(`outcome: ${outcome}`);
  await emit(outcome);
}
function renderPlanLine(lines, ctx, plan) {
  const verb = ctx.dryRun ? "would be" : "will be";
  lines.push(
    `delete preview: ${plan.seedKeys.length} process instance(s) with incidents, ${plan.affectedKeys.length} affected process instance(s) across ${plan.resolvedRootKeys.length} root(s) ${verb} deleted`
  );
  if (plan.nonFinalAffectedKeys.length > 0) {
    lines.push(
      `non-final affected process instances: ${plan.nonFinalAffectedKeys.length} (use --force to cancel before delete)`
    );
  }
}
function confirmationPrompt2(plan) {
  return `incident purge: ${plan.seedKeys.length} process instance(s) with incidents, ${plan.affectedKeys.length} affected process instance(s) across ${plan.resolvedRootKeys.length} root(s) will be deleted. Do you want to proceed?`;
}

// src/playbooks/purge-orphan.ts
var SCHEMA3 = "ops.orphan-process-instances.v1";
var COMMAND3 = "ops purge orphan-process-instances";
async function run3(ctx) {
  const startedAt = Date.now();
  const report = baseReport(ctx, { schemaVersion: SCHEMA3, command: COMMAND3, startedAt });
  const lines = [];
  const emit = (outcome2) => ctx.emit(finalize(report, outcome2, startedAt), () => lines);
  const state = str(ctx.flags.raw.state);
  const filter = {
    parentProcessInstanceKey: { $exists: true },
    ...state && state !== "all" ? { state: state.toUpperCase() } : {},
    ...str(ctx.flags.raw.bpmnProcessId) ? { processDefinitionId: str(ctx.flags.raw.bpmnProcessId) } : {},
    ...str(ctx.flags.raw.pdKey) ? { processDefinitionKey: str(ctx.flags.raw.pdKey) } : {}
  };
  lines.push(
    ctx.dryRun ? "dry run: purge orphan process-instances" : "purge orphan process-instances"
  );
  const parentExists = /* @__PURE__ */ new Map();
  const isOrphan = async (pi) => {
    const parentKey = pi.parentProcessInstanceKey;
    if (!parentKey) return false;
    let exists = parentExists.get(parentKey);
    if (exists === void 0) {
      exists = await ctx.api.getProcessInstance(parentKey) !== void 0;
      parentExists.set(parentKey, exists);
    }
    return !exists;
  };
  const discovery = await discoverWhere(
    (limit, after) => ctx.api.searchProcessInstancesPage(filter, limit, after),
    isOrphan,
    { limit: ctx.flags.limit, batchSize: ctx.flags.batchSize }
  );
  const seedKeys = discovery.items.map((pi) => pi.processInstanceKey);
  report.discovery = {
    filters: filter,
    orphanCandidateCount: seedKeys.length,
    scope: discovery.scope,
    orphanKeys: seedKeys
  };
  lines.push(`orphan candidates: ${seedKeys.length}`);
  if (discovery.scope.limited || ctx.verbose) lines.push(describeScope(discovery.scope));
  if (seedKeys.length === 0) {
    report.deletePlan = { status: "skipped" };
    report.deletion = { status: "skipped" };
    report.notices.push("no orphan process instances found");
    lines.push("outcome: planned");
    await emit("planned");
    return;
  }
  const plan = await planFamilyDelete(ctx.api, seedKeys, {
    workers: ctx.workerCount(seedKeys.length),
    failFast: ctx.flags.failFast,
    includeNonFinalRoots: true
  });
  report.deletePlan = { status: "planned", ...plan };
  renderPlanLine2(lines, ctx, plan);
  if (ctx.dryRun) {
    report.deletion = { status: "skipped" };
    lines.push("outcome: planned");
    await emit("planned");
    return;
  }
  if (blockedByNonFinal(plan, ctx.flags.force)) {
    const message = blockedMessage(plan);
    report.deletion = { status: "blocked", errors: [message] };
    report.errors.push(message);
    lines.push(`blocked: ${message}`);
    lines.push("outcome: failed");
    await emit("failed");
    return;
  }
  if (!await ctx.confirm(confirmationPrompt3(plan))) {
    report.deletion = { status: "skipped" };
    report.notices.push("aborted by user");
    lines.push("aborted by user");
    await emit("planned");
    return;
  }
  const deletion = await runDelete(ctx, plan);
  report.deletion = deletion;
  const outcome = deletion.errors.length > 0 ? "partial" : "executed";
  lines.push(
    `deleted: ${deletion.items.filter((i) => i.deleted).length}/${deletion.submittedRootKeys.length} root(s)${deletion.noWait ? " (submitted, not awaited)" : ""}`
  );
  lines.push(`outcome: ${outcome}`);
  await emit(outcome);
}
function renderPlanLine2(lines, ctx, plan) {
  const verb = ctx.dryRun ? "would be" : "will be";
  lines.push(
    `delete preview: ${plan.seedKeys.length} orphan candidate(s), ${plan.affectedKeys.length} affected process instance(s) across ${plan.resolvedRootKeys.length} root(s) ${verb} deleted`
  );
  if (plan.nonFinalAffectedKeys.length > 0) {
    lines.push(
      `non-final affected process instances: ${plan.nonFinalAffectedKeys.length} (use --force to cancel before delete)`
    );
  }
}
function confirmationPrompt3(plan) {
  return `orphan purge: ${plan.seedKeys.length} orphan candidate(s), ${plan.affectedKeys.length} affected process instance(s) across ${plan.resolvedRootKeys.length} root(s) will be deleted. Do you want to proceed?`;
}

// src/engine/repair.ts
var REPAIR_SCHEMA = "ops.repair.v1";
function repairOptionsFromFlags(ctx) {
  const raw = ctx.flags.raw;
  const retries = typeof raw.retries === "number" ? raw.retries : 1;
  const timeoutMs = typeof raw.jobTimeoutMs === "number" && raw.jobTimeoutMs > 0 ? raw.jobTimeoutMs : void 0;
  let variables;
  if (typeof raw.vars === "string" && raw.vars.trim() !== "") {
    variables = parseJsonObject(raw.vars, "vars");
  }
  return { retries, timeoutMs, variables };
}
function freeze(incidents, options) {
  const processInstanceKeys = unique(
    incidents.map((i) => i.processInstanceKey).filter((k) => !!k)
  );
  return {
    incidentKeys: unique(incidents.map((i) => i.incidentKey)),
    processInstanceKeys,
    jobKeys: unique(incidents.map((i) => i.jobKey).filter((k) => !!k)),
    variableScopeKeys: options.variables ? processInstanceKeys : []
  };
}
async function runRepair(ctx, report, lines, startedAt, incidents, emit) {
  const options = repairOptionsFromFlags(ctx);
  const frozen = freeze(incidents, options);
  report.plan = {
    status: "planned",
    activeIncidentCount: frozen.incidentKeys.length,
    processInstanceCount: frozen.processInstanceKeys.length,
    relatedJobCount: frozen.jobKeys.length,
    variableScopeCount: frozen.variableScopeKeys.length,
    retries: options.retries,
    jobTimeoutMs: options.timeoutMs
  };
  const verb = ctx.dryRun ? "would be" : "will be";
  lines.push(
    `repair preview: ${frozen.incidentKeys.length} active incident(s) ${verb} resolved; ${frozen.jobKeys.length} related job(s), ${frozen.variableScopeKeys.length} variable scope(s) ${verb} updated`
  );
  lines.push(
    `job repair coverage: ${frozen.jobKeys.length} related job(s), ${frozen.incidentKeys.length - frozen.jobKeys.length} incident(s) without related jobs`
  );
  if (frozen.incidentKeys.length === 0) {
    report.execution = { status: "skipped" };
    report.remaining = { status: "skipped" };
    report.notices = [...asArray(report.notices), "no active incidents to repair"];
    lines.push("outcome: planned");
    await emit("planned");
    return;
  }
  if (ctx.dryRun) {
    report.execution = { status: "skipped" };
    lines.push("outcome: planned");
    await emit("planned");
    return;
  }
  if (!await ctx.confirm(confirmationPrompt4(frozen))) {
    report.execution = { status: "skipped" };
    report.notices = [...asArray(report.notices), "aborted by user"];
    lines.push("aborted by user");
    await emit("planned");
    return;
  }
  const variableScopes = [];
  const blockedScopes = /* @__PURE__ */ new Set();
  if (options.variables) {
    for (const key of frozen.variableScopeKeys) {
      try {
        await ctx.api.setProcessInstanceVariables(key, options.variables);
        variableScopes.push({ processInstanceKey: key, updated: true });
      } catch (err) {
        blockedScopes.add(key);
        variableScopes.push({
          processInstanceKey: key,
          updated: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }
  const workers = ctx.workerCount(incidents.length);
  const results = await runPool(
    incidents,
    { workers, failFast: ctx.flags.failFast },
    (incident) => repairOne(ctx, incident, options, blockedScopes)
  );
  const items = results.map(
    (r) => r.value ?? {
      incidentKey: r.item.incidentKey,
      processInstanceKey: r.item.processInstanceKey,
      jobKey: r.item.jobKey,
      retriesUpdated: false,
      timeoutUpdated: false,
      resolved: false,
      error: r.error?.message
    }
  );
  const errors = items.filter((i) => i.error).map((i) => `${i.incidentKey}: ${i.error}`).concat(
    variableScopes.filter((v) => v.error).map((v) => `${v.processInstanceKey}: ${v.error}`)
  );
  const resolved = items.filter((i) => i.resolved).length;
  report.variableScopes = variableScopes;
  report.execution = {
    status: errors.length > 0 ? "failed" : ctx.flags.noWait ? "submitted" : "confirmed",
    items,
    resolvedIncidentCount: resolved,
    submitted: items.length > 0,
    noWait: ctx.flags.noWait,
    errors
  };
  let remainingActive = 0;
  if (!ctx.flags.noWait) {
    remainingActive = await countRemainingActive(ctx, frozen.processInstanceKeys);
  }
  report.remaining = {
    status: ctx.flags.noWait ? "submitted" : "confirmed",
    checked: !ctx.flags.noWait,
    activeIncidentCount: remainingActive
  };
  if (errors.length > 0) {
    report.errors = [...asArray(report.errors), ...errors];
  }
  const outcome = errors.length > 0 ? resolved > 0 ? "partial" : "failed" : "executed";
  lines.push(
    `resolved: ${resolved}/${frozen.incidentKeys.length} incident(s)${ctx.flags.noWait ? " (submitted, not awaited)" : ""}`
  );
  if (!ctx.flags.noWait) lines.push(`remaining active incidents: ${remainingActive}`);
  lines.push(`outcome: ${outcome}`);
  await emit(outcome);
}
async function repairOne(ctx, incident, options, blockedScopes) {
  const item = {
    incidentKey: incident.incidentKey,
    processInstanceKey: incident.processInstanceKey,
    jobKey: incident.jobKey,
    retriesUpdated: false,
    timeoutUpdated: false,
    resolved: false
  };
  if (incident.processInstanceKey && blockedScopes.has(incident.processInstanceKey)) {
    item.error = "variable update failed for process-instance scope; incident resolution skipped";
    return item;
  }
  if (incident.jobKey) {
    if (options.retries > 0) {
      await ctx.api.updateJob(incident.jobKey, { retries: options.retries });
      item.retriesUpdated = true;
    }
    if (options.timeoutMs !== void 0) {
      await ctx.api.updateJob(incident.jobKey, { timeout: options.timeoutMs });
      item.timeoutUpdated = true;
    }
  }
  await ctx.api.resolveIncident(incident.incidentKey);
  item.resolved = true;
  return item;
}
async function countRemainingActive(ctx, processInstanceKeys) {
  let total = 0;
  for (const key of processInstanceKeys) {
    const remaining = await ctx.api.incidentsForProcessInstance(key, "ACTIVE");
    total += remaining.length;
  }
  return total;
}
function confirmationPrompt4(frozen) {
  return `incident repair: ${frozen.incidentKeys.length} active incident(s), ${frozen.processInstanceKeys.length} process instance(s), ${frozen.jobKeys.length} related job(s), ${frozen.variableScopeKeys.length} variable scope(s) will be repaired. Do you want to proceed?`;
}
function asArray(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

// src/playbooks/repair-incident.ts
var COMMAND4 = "ops repair incident";
async function run4(ctx) {
  const startedAt = Date.now();
  const report = baseReport(ctx, { schemaVersion: REPAIR_SCHEMA, command: COMMAND4, startedAt });
  const lines = [];
  const emit = (outcome) => ctx.emit(finalize(report, outcome, startedAt), () => lines);
  lines.push(ctx.dryRun ? "dry run: repair incidents" : "repair incidents");
  const explicitKeys = keyList(ctx.flags.raw.key);
  const incidents = explicitKeys.length > 0 ? await resolveExplicit(ctx, explicitKeys, report) : await discoverIncidents(ctx, report, lines);
  await runRepair(ctx, report, lines, startedAt, incidents, emit);
}
async function resolveExplicit(ctx, keys, report) {
  const incidents = [];
  const missing = [];
  for (const key of keys) {
    const page = await ctx.api.searchIncidentsPage({ incidentKey: key }, 1);
    const match = page.items[0];
    if (match) incidents.push(match);
    else missing.push(key);
  }
  report.discovery = {
    mode: "explicit",
    requestedIncidentKeys: keys,
    resolvedIncidentCount: incidents.length,
    missingIncidentKeys: missing
  };
  if (missing.length > 0) {
    report.notices = [`${missing.length} incident key(s) not found`];
  }
  return incidents;
}
async function discoverIncidents(ctx, report, lines) {
  const state = str(ctx.flags.raw.state) ?? "ACTIVE";
  const filter = {
    ...state && state !== "all" ? { state: state.toUpperCase() } : {},
    ...str(ctx.flags.raw.errorType) ? { errorType: str(ctx.flags.raw.errorType) } : {},
    ...str(ctx.flags.raw.bpmnProcessId) ? { processDefinitionId: str(ctx.flags.raw.bpmnProcessId) } : {},
    ...str(ctx.flags.raw.pdKey) ? { processDefinitionKey: str(ctx.flags.raw.pdKey) } : {},
    ...str(ctx.flags.raw.piKey) ? { processInstanceKey: str(ctx.flags.raw.piKey) } : {},
    ...str(ctx.flags.raw.elementId) ? { elementId: str(ctx.flags.raw.elementId) } : {}
  };
  const discovery = await discoverAll(
    (limit, after) => ctx.api.searchIncidentsPage(filter, limit, after),
    { limit: ctx.flags.limit, batchSize: ctx.flags.batchSize }
  );
  report.discovery = {
    mode: "search",
    filters: filter,
    incidentCount: discovery.items.length,
    scope: discovery.scope,
    incidentKeys: discovery.items.map((i) => i.incidentKey)
  };
  if (discovery.scope.limited || ctx.verbose) lines.push(describeScope(discovery.scope));
  return discovery.items;
}

// src/playbooks/repair-process-instance.ts
var COMMAND5 = "ops repair process-instance";
async function run5(ctx) {
  const startedAt = Date.now();
  const report = baseReport(ctx, { schemaVersion: REPAIR_SCHEMA, command: COMMAND5, startedAt });
  const lines = [];
  const emit = (outcome) => ctx.emit(finalize(report, outcome, startedAt), () => lines);
  lines.push(
    ctx.dryRun ? "dry run: repair process-instance incidents" : "repair process-instance incidents"
  );
  const explicitKeys = keyList(ctx.flags.raw.key);
  const processInstanceKeys = explicitKeys.length > 0 ? explicitKeys : await discoverProcessInstances(ctx, report, lines);
  const incidents = await collectIncidents(ctx, processInstanceKeys, report);
  await runRepair(ctx, report, lines, startedAt, incidents, emit);
}
async function discoverProcessInstances(ctx, report, lines) {
  const state = str(ctx.flags.raw.state) ?? "ACTIVE";
  const filter = {
    hasIncident: true,
    ...state && state !== "all" ? { state: state.toUpperCase() } : {},
    ...str(ctx.flags.raw.bpmnProcessId) ? { processDefinitionId: str(ctx.flags.raw.bpmnProcessId) } : {},
    ...str(ctx.flags.raw.pdKey) ? { processDefinitionKey: str(ctx.flags.raw.pdKey) } : {},
    ...str(ctx.flags.raw.parentKey) ? { parentProcessInstanceKey: str(ctx.flags.raw.parentKey) } : {}
  };
  const discovery = await discoverAll(
    (limit, after) => ctx.api.searchProcessInstancesPage(filter, limit, after),
    { limit: ctx.flags.limit, batchSize: ctx.flags.batchSize }
  );
  const keys = unique(discovery.items.map((pi) => pi.processInstanceKey));
  report.selection = {
    mode: "search",
    filters: filter,
    processInstanceCount: keys.length,
    scope: discovery.scope,
    processInstanceKeys: keys
  };
  if (discovery.scope.limited || ctx.verbose) lines.push(describeScope(discovery.scope));
  return keys;
}
async function collectIncidents(ctx, processInstanceKeys, report) {
  const state = str(ctx.flags.raw.incidentState) ?? "ACTIVE";
  const errorType = str(ctx.flags.raw.errorType);
  const all = [];
  const skipped = [];
  for (const key of processInstanceKeys) {
    const incidents = await ctx.api.incidentsForProcessInstance(
      key,
      state === "all" ? void 0 : state.toUpperCase()
    );
    const filtered = errorType ? incidents.filter((i) => (i.errorType ?? "").toLowerCase() === errorType.toLowerCase()) : incidents;
    if (filtered.length === 0) skipped.push(key);
    all.push(...filtered);
  }
  report.discovery = {
    mode: "process-instance",
    requestedProcessInstanceKeys: [...processInstanceKeys],
    incidentCount: all.length,
    skippedProcessInstanceKeys: skipped,
    incidentKeys: all.map((i) => i.incidentKey)
  };
  if (skipped.length > 0) {
    report.notices = [`${skipped.length} process instance(s) had no matching active incidents`];
  }
  return all;
}

// src/playbooks/retention-policy.ts
var SCHEMA4 = "ops.retention-policy.v1";
var COMMAND6 = "ops execute retention-policy";
async function run6(ctx) {
  const startedAt = Date.now();
  const report = baseReport(ctx, { schemaVersion: SCHEMA4, command: COMMAND6, startedAt });
  const lines = [];
  const emit = (outcome2) => ctx.emit(finalize(report, outcome2, startedAt), () => lines);
  const retentionDays = num(ctx.flags.raw.retentionDays);
  if (retentionDays === void 0 || retentionDays < 0) {
    throw new Error(
      "ops execute retention-policy requires --retention-days (non-negative integer)"
    );
  }
  const boundary = new Date(startedAt - retentionDays * 864e5).toISOString();
  const state = str(ctx.flags.raw.state);
  const filter = {
    endDate: { before: boundary },
    ...state && state !== "all" ? { state: state.toUpperCase() } : {},
    ...str(ctx.flags.raw.bpmnProcessId) ? { processDefinitionId: str(ctx.flags.raw.bpmnProcessId) } : {},
    ...str(ctx.flags.raw.pdKey) ? { processDefinitionKey: str(ctx.flags.raw.pdKey) } : {},
    ...str(ctx.flags.raw.parentKey) ? { parentProcessInstanceKey: str(ctx.flags.raw.parentKey) } : {}
  };
  lines.push(ctx.dryRun ? "dry run: execute retention-policy" : "execute retention-policy");
  ctx.progress(
    `retention: candidates finished on or before ${boundary} (retention-days ${retentionDays})`
  );
  const discovery = await discoverAll(
    (limit, after) => ctx.api.searchProcessInstancesPage(filter, limit, after),
    { limit: ctx.flags.limit, batchSize: ctx.flags.batchSize }
  );
  const seedKeys = discovery.items.map((pi) => pi.processInstanceKey);
  report.discovery = {
    retentionDays,
    derivedEndDateBoundary: boundary,
    filters: filter,
    candidateCount: seedKeys.length,
    scope: discovery.scope,
    seedKeys
  };
  lines.push(`retention candidates: ${seedKeys.length}`);
  if (discovery.scope.limited || ctx.verbose) lines.push(describeScope(discovery.scope));
  if (seedKeys.length === 0) {
    report.deletePlan = { status: "skipped" };
    report.deletion = { status: "skipped" };
    report.notices.push("no retention candidates found");
    lines.push("outcome: planned");
    await emit("planned");
    return;
  }
  const plan = await planFamilyDelete(ctx.api, seedKeys, {
    workers: ctx.workerCount(seedKeys.length),
    failFast: ctx.flags.failFast,
    includeNonFinalRoots: false
  });
  report.deletePlan = { status: "planned", ...plan };
  renderPlanLine3(lines, ctx, plan);
  if (ctx.dryRun) {
    report.deletion = { status: "skipped" };
    lines.push("outcome: planned");
    await emit("planned");
    return;
  }
  if (blockedByNonFinal(plan, ctx.flags.force)) {
    const message = blockedMessage(plan);
    report.deletion = { status: "blocked", errors: [message] };
    report.errors.push(message);
    lines.push(`blocked: ${message}`);
    lines.push("outcome: failed");
    await emit("failed");
    return;
  }
  if (plan.resolvedRootKeys.length === 0) {
    report.deletion = { status: "skipped" };
    report.notices.push("no final-root retention scope resolved");
    lines.push("outcome: planned");
    await emit("planned");
    return;
  }
  if (!await ctx.confirm(confirmationPrompt5(plan))) {
    report.deletion = { status: "skipped" };
    report.notices.push("aborted by user");
    lines.push("aborted by user");
    await emit("planned");
    return;
  }
  const deletion = await runDelete(ctx, plan);
  report.deletion = deletion;
  const outcome = deletion.errors.length > 0 ? "partial" : "executed";
  lines.push(
    `deleted: ${deletion.items.filter((i) => i.deleted).length}/${deletion.submittedRootKeys.length} root(s)${deletion.noWait ? " (submitted, not awaited)" : ""}`
  );
  lines.push(`outcome: ${outcome}`);
  await emit(outcome);
}
function renderPlanLine3(lines, ctx, plan) {
  const verb = ctx.dryRun ? "would be" : "will be";
  lines.push(
    `delete preview: ${plan.seedKeys.length} retention candidate(s), ${plan.affectedKeys.length} affected process instance(s) across ${plan.resolvedRootKeys.length} root(s) ${verb} deleted`
  );
  if (plan.nonFinalAffectedKeys.length > 0) {
    lines.push(
      `non-final affected process instances: ${plan.nonFinalAffectedKeys.length} (use --force to cancel before delete)`
    );
  }
  if (plan.skippedSeedKeys.length > 0) {
    lines.push(`skipped: ${plan.skippedSeedKeys.length} candidate(s) whose root is not final`);
  }
}
function confirmationPrompt5(plan) {
  let prompt = `retention cleanup: ${plan.seedKeys.length} retention candidate(s), ${plan.affectedKeys.length} affected process instance(s) across ${plan.resolvedRootKeys.length} root(s) will be deleted`;
  if (plan.skippedSeedKeys.length > 0) {
    prompt += `; ${plan.skippedSeedKeys.length} retention candidate(s) skipped because their root is not final`;
  }
  return `${prompt}. Do you want to proceed?`;
}

// src/fixtures/smoke-test.ts
var SMOKE_TEST_PROCESS_ID = "c8ctl-ops-smoke-test";
var SMOKE_TEST_RESOURCE_NAME = "c8ctl-ops-smoke-test.bpmn";
var SMOKE_TEST_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="c8ctl-ops-smoke-test-definitions"
                  targetNamespace="http://camunda.org/schema/c8ctl-ops">
  <bpmn:process id="${SMOKE_TEST_PROCESS_ID}" name="c8ctl ops smoke test" isExecutable="true">
    <bpmn:startEvent id="StartEvent">
      <bpmn:outgoing>Flow_start_sub</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="Subprocess" name="smoke subprocess">
      <bpmn:incoming>Flow_start_sub</bpmn:incoming>
      <bpmn:outgoing>Flow_sub_end</bpmn:outgoing>
      <bpmn:startEvent id="SubStart">
        <bpmn:outgoing>Flow_substart_subend</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:endEvent id="SubEnd">
        <bpmn:incoming>Flow_substart_subend</bpmn:incoming>
      </bpmn:endEvent>
      <bpmn:sequenceFlow id="Flow_substart_subend" sourceRef="SubStart" targetRef="SubEnd" />
    </bpmn:subProcess>
    <bpmn:endEvent id="EndEvent">
      <bpmn:incoming>Flow_sub_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_start_sub" sourceRef="StartEvent" targetRef="Subprocess" />
    <bpmn:sequenceFlow id="Flow_sub_end" sourceRef="Subprocess" targetRef="EndEvent" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram">
    <bpmndi:BPMNPlane id="Plane" bpmnElement="${SMOKE_TEST_PROCESS_ID}">
      <bpmndi:BPMNShape id="StartEvent_di" bpmnElement="StartEvent">
        <dc:Bounds x="160" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Subprocess_di" bpmnElement="Subprocess" isExpanded="false">
        <dc:Bounds x="250" y="78" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_di" bpmnElement="EndEvent">
        <dc:Bounds x="430" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_start_sub_di" bpmnElement="Flow_start_sub">
        <di:waypoint x="196" y="118" />
        <di:waypoint x="250" y="118" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_sub_end_di" bpmnElement="Flow_sub_end">
        <di:waypoint x="370" y="118" />
        <di:waypoint x="430" y="118" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;

// src/playbooks/smoke-test.ts
var SCHEMA5 = "ops.smoke-test.v1";
var COMMAND7 = "ops execute smoke-test";
async function run7(ctx) {
  const startedAt = Date.now();
  const report = baseReport(ctx, { schemaVersion: SCHEMA5, command: COMMAND7, startedAt });
  const lines = [];
  const emit = (outcome2) => ctx.emit(finalize(report, outcome2, startedAt), () => lines);
  const count = Math.max(1, num(ctx.flags.raw.count) ?? 1);
  const cleanup = ctx.flags.raw.noCleanup !== true;
  lines.push(ctx.dryRun ? "dry run: smoke test" : "smoke test");
  try {
    await ctx.api.getTopology();
    report.plan = { status: "confirmed", connectivity: "ok", plannedInstances: count, cleanup };
    lines.push("plan: connectivity ok");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    report.plan = { status: "failed", connectivity: "failed", errors: [message] };
    report.deployment = { status: "skipped" };
    report.run = { status: "skipped" };
    report.walk = { status: "skipped" };
    report.cleanup = { status: "skipped" };
    report.errors.push(message);
    lines.push(`plan: connectivity failed: ${message}`);
    lines.push("outcome: failed");
    await emit("failed");
    return;
  }
  if (ctx.dryRun) {
    report.deployment = { status: "skipped" };
    report.run = { status: "skipped" };
    report.walk = { status: "skipped" };
    report.cleanup = { status: "skipped" };
    lines.push(
      `plan: deploy fixture ${SMOKE_TEST_RESOURCE_NAME}, start ${count} process instance(s), walk families, ${cleanup ? "clean up" : "retain"} resources`
    );
    lines.push("outcome: planned");
    await emit("planned");
    return;
  }
  if (!await ctx.confirm(confirmationPrompt6(count, cleanup))) {
    report.deployment = { status: "skipped" };
    report.run = { status: "skipped" };
    report.walk = { status: "skipped" };
    report.cleanup = { status: "skipped" };
    report.notices.push("aborted by user");
    lines.push("aborted by user");
    await emit("planned");
    return;
  }
  let processDefinitionKey;
  try {
    const deployment = await ctx.api.deployResource(SMOKE_TEST_RESOURCE_NAME, SMOKE_TEST_BPMN);
    processDefinitionKey = deployment.processDefinitionKey;
    report.deployment = {
      status: "confirmed",
      resourceName: SMOKE_TEST_RESOURCE_NAME,
      processDefinitionId: SMOKE_TEST_PROCESS_ID,
      processDefinitionKey
    };
    lines.push(
      `deploy: confirmed process definition ${processDefinitionKey ?? SMOKE_TEST_PROCESS_ID}`
    );
  } catch (err) {
    return failFrom(ctx, report, lines, emit, "deployment", err, ["run", "walk", "cleanup"]);
  }
  const createWorkers = ctx.workerCount(count);
  const createResults = await runPool(
    Array.from({ length: count }, (_, i) => i),
    { workers: createWorkers, failFast: ctx.flags.failFast },
    async () => {
      const pi = await ctx.api.createProcessInstance({
        processDefinitionId: SMOKE_TEST_PROCESS_ID
      });
      return pi.processInstanceKey;
    }
  );
  const createdKeys = createResults.map((r) => r.value).filter((k) => typeof k === "string" && k.length > 0);
  const createErrors = createResults.filter((r) => r.error).map((r) => r.error?.message ?? "error");
  report.run = {
    status: createErrors.length > 0 ? "failed" : "confirmed",
    requested: count,
    created: createdKeys.length,
    processInstanceKeys: createdKeys,
    errors: createErrors
  };
  lines.push(`run: created ${createdKeys.length}/${count} process instance(s)`);
  if (createErrors.length > 0) report.errors.push(...createErrors);
  const walkResults = await runPool(
    createdKeys,
    { workers: ctx.workerCount(createdKeys.length), failFast: ctx.flags.failFast },
    async (rootKey) => (await collectDescendants(ctx.api, rootKey)).length
  );
  const walkErrors = walkResults.filter((r) => r.error).map((r) => r.error?.message ?? "error");
  const walkedFamilies = walkResults.filter((r) => r.value !== void 0).length;
  const elementsWalked = walkResults.reduce((n, r) => n + (r.value ?? 0), 0);
  report.walk = {
    status: walkErrors.length > 0 ? "failed" : "confirmed",
    walkedFamilies,
    processInstancesVisited: elementsWalked,
    errors: walkErrors
  };
  lines.push(
    `walk: visited ${elementsWalked} process instance(s) across ${walkedFamilies} family(ies)`
  );
  if (walkErrors.length > 0) report.errors.push(...walkErrors);
  if (!cleanup) {
    report.cleanup = {
      status: "skipped",
      processInstancesRetained: createdKeys.length,
      processDefinitionRetained: processDefinitionKey
    };
    lines.push("cleanup: retained created resources");
  } else {
    const cleanupErrors = await runCleanup(ctx, createdKeys, processDefinitionKey, report, lines);
    if (cleanupErrors.length > 0) report.errors.push(...cleanupErrors);
  }
  const outcome = report.errors.length > 0 ? "partial" : "executed";
  lines.push(`outcome: ${outcome}`);
  await emit(outcome);
}
async function runCleanup(ctx, createdKeys, processDefinitionKey, report, lines) {
  const deleteResults = await runPool(
    createdKeys,
    { workers: ctx.workerCount(createdKeys.length), failFast: false },
    async (key) => {
      await ctx.api.deleteProcessInstance(key);
      return true;
    }
  );
  const deleted = deleteResults.filter((r) => r.value === true).length;
  const errors = deleteResults.filter((r) => r.error).map((r) => `${r.item}: ${r.error?.message}`);
  let definitionDeleted = false;
  let definitionEligible = false;
  if (processDefinitionKey && errors.length === 0) {
    const remaining = await ctx.api.searchProcessInstancesPage({ processDefinitionKey }, 1);
    definitionEligible = remaining.items.length === 0;
    if (definitionEligible) {
      try {
        await ctx.api.deleteResource(processDefinitionKey);
        definitionDeleted = true;
      } catch (err) {
        errors.push(
          `definition ${processDefinitionKey}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }
  report.cleanup = {
    status: errors.length > 0 ? "failed" : "confirmed",
    processInstancesDeleted: deleted,
    processDefinitionEligible: definitionEligible,
    processDefinitionDeleted: definitionDeleted,
    errors
  };
  lines.push(
    `cleanup: deleted ${deleted}/${createdKeys.length} process instance(s)${definitionDeleted ? "; deleted process definition" : definitionEligible ? "" : "; retained process definition (unrelated instances exist)"}`
  );
  return errors;
}
async function failFrom(ctx, report, lines, emit, phase, err, skip) {
  const message = err instanceof Error ? err.message : String(err);
  report[phase] = { status: "failed", errors: [message] };
  for (const s of skip) report[s] = { status: "skipped" };
  const errors = Array.isArray(report.errors) ? report.errors : [];
  report.errors = [...errors.filter((e) => typeof e === "string"), message];
  lines.push(`${phase}: failed: ${message}`);
  lines.push("outcome: failed");
  await emit("failed");
}
function confirmationPrompt6(count, cleanup) {
  const clause = cleanup ? "then clean up created resources" : "then retain created resources";
  return `smoke test: deploy fixture, start ${count} process instance(s), walk process-instance families, ${clause}. Do you want to proceed?`;
}

// src/engine/walk.ts
var MAX_DEPTH2 = 1e3;
var MISSING_ANCESTOR_WARNING = "one or more parent process instances were not found";
async function ancestryPath(api, seedKey) {
  const chain = /* @__PURE__ */ new Map();
  const keys = [];
  let currentKey = seedKey;
  let current = await api.getProcessInstance(currentKey);
  if (!current) {
    return {
      chain,
      keys,
      rootKey: seedKey,
      seedFound: false,
      orphaned: true,
      missingAncestor: seedKey
    };
  }
  for (let depth = 0; depth < MAX_DEPTH2; depth++) {
    chain.set(currentKey, current);
    keys.push(currentKey);
    const parentKey = current.parentProcessInstanceKey;
    if (!parentKey) {
      return { chain, keys, rootKey: currentKey, seedFound: true, orphaned: false };
    }
    const parent = await api.getProcessInstance(parentKey);
    if (!parent) {
      return {
        chain,
        keys,
        rootKey: currentKey,
        seedFound: true,
        orphaned: true,
        missingAncestor: parentKey
      };
    }
    currentKey = parentKey;
    current = parent;
  }
  return { chain, keys, rootKey: currentKey, seedFound: true, orphaned: false };
}
async function descendantTree(api, rootKey) {
  const chain = /* @__PURE__ */ new Map();
  const edges = /* @__PURE__ */ new Map();
  const keys = [];
  const root = await api.getProcessInstance(rootKey);
  chain.set(rootKey, root ?? { processInstanceKey: rootKey });
  keys.push(rootKey);
  const seen = /* @__PURE__ */ new Set([rootKey]);
  const queue = [rootKey];
  while (queue.length > 0) {
    const key = queue.shift();
    if (key === void 0) break;
    const children = await api.childrenOf(key);
    const childKeys = [];
    for (const child of children) {
      if (seen.has(child.processInstanceKey)) continue;
      seen.add(child.processInstanceKey);
      chain.set(child.processInstanceKey, child);
      keys.push(child.processInstanceKey);
      childKeys.push(child.processInstanceKey);
      queue.push(child.processInstanceKey);
    }
    if (childKeys.length > 0) edges.set(key, childKeys);
  }
  return { chain, edges, keys, rootFound: root !== void 0 };
}
async function walk(api, seedKey, mode) {
  if (mode === "parent") {
    const a2 = await ancestryPath(api, seedKey);
    return {
      mode,
      seedKey,
      rootKey: a2.rootKey,
      keys: a2.keys,
      chain: a2.chain,
      edges: /* @__PURE__ */ new Map(),
      seedFound: a2.seedFound,
      orphaned: a2.orphaned,
      missingAncestor: a2.missingAncestor,
      warning: a2.missingAncestor ? MISSING_ANCESTOR_WARNING : void 0
    };
  }
  if (mode === "children") {
    const d2 = await descendantTree(api, seedKey);
    return {
      mode,
      seedKey,
      rootKey: seedKey,
      keys: d2.keys,
      chain: d2.chain,
      edges: d2.edges,
      seedFound: d2.rootFound,
      orphaned: false,
      missingAncestor: d2.rootFound ? void 0 : seedKey,
      warning: d2.rootFound ? void 0 : MISSING_ANCESTOR_WARNING
    };
  }
  const a = await ancestryPath(api, seedKey);
  const d = await descendantTree(api, a.rootKey);
  return {
    mode,
    seedKey,
    rootKey: a.rootKey,
    keys: d.keys,
    chain: d.chain,
    edges: d.edges,
    seedFound: a.seedFound,
    orphaned: a.orphaned,
    missingAncestor: a.missingAncestor,
    warning: a.missingAncestor ? MISSING_ANCESTOR_WARNING : void 0
  };
}

// src/playbooks/walk-process-instance.ts
var SCHEMA6 = "ops.walk.v1";
var COMMAND8 = "ops walk process-instance";
async function run8(ctx) {
  const startedAt = Date.now();
  const report = baseReport(ctx, { schemaVersion: SCHEMA6, command: COMMAND8, startedAt });
  const lines = [];
  const emit = (outcome) => ctx.emit(finalize(report, outcome, startedAt), () => lines);
  const seeds = resolveSeeds(ctx);
  if (seeds.length === 0) {
    const message = "walk process-instance requires at least one --key (process-instance key)";
    report.errors.push(message);
    lines.push(message);
    await emit("failed");
    return;
  }
  const mode = resolveMode(ctx);
  const flat = ctx.flags.raw.flat === true;
  const withIncidents = ctx.flags.raw.withIncidents === true;
  report.mode = mode;
  report.render = flat ? "flat" : "tree";
  report.seeds = seeds;
  const renders = [];
  const walkSummaries = [];
  let sawWarning = false;
  for (const seedKey of seeds) {
    const result = await walk(ctx.api, seedKey, mode);
    const incidents = withIncidents ? await collectIncidents2(ctx, result) : /* @__PURE__ */ new Map();
    renders.push({ result, incidents });
    if (result.warning) {
      sawWarning = true;
      report.notices.push(`${seedKey}: ${result.warning}`);
    }
    walkSummaries.push({
      seedKey,
      mode,
      rootKey: result.rootKey,
      seedFound: result.seedFound,
      orphaned: result.orphaned,
      ...result.missingAncestor ? { missingAncestor: result.missingAncestor } : {},
      instanceCount: result.keys.length,
      incidentCount: countIncidents(incidents),
      processInstanceKeys: result.keys
    });
  }
  report.walks = walkSummaries;
  for (const { result, incidents } of renders) {
    if (renders.length > 1) lines.push(`# ${result.seedKey} (${result.mode})`);
    renderResult(lines, result, incidents, flat);
    if (result.warning) lines.push(`warning: ${result.warning}`);
    if (renders.length > 1) lines.push("");
  }
  await emit(sawWarning ? "partial" : "executed");
}
function resolveSeeds(ctx) {
  const keys = keyList(ctx.flags.raw.key);
  const piKey = str(ctx.flags.raw.piKey);
  if (piKey && !keys.includes(piKey)) keys.push(piKey);
  return keys;
}
function resolveMode(ctx) {
  if (ctx.flags.raw.parent === true) return "parent";
  if (ctx.flags.raw.children === true) return "children";
  return "family";
}
async function collectIncidents2(ctx, result) {
  const byKey = /* @__PURE__ */ new Map();
  for (const key of result.keys) {
    const pi = result.chain.get(key);
    if (pi && pi.hasIncident === false) continue;
    const incidents = await ctx.api.incidentsForProcessInstance(key, "ACTIVE");
    if (incidents.length > 0) byKey.set(key, incidents);
  }
  return byKey;
}
function countIncidents(byKey) {
  let total = 0;
  for (const list of byKey.values()) total += list.length;
  return total;
}
function renderResult(lines, result, incidents, flat) {
  if (result.keys.length === 0) return;
  if (result.mode === "parent") {
    renderChain(lines, result, incidents);
    return;
  }
  if (flat) {
    renderFlat(lines, result, incidents);
    return;
  }
  renderTree(lines, result, incidents);
}
function renderChain(lines, result, incidents) {
  const ordered = [...result.keys].reverse();
  ordered.forEach((key, index) => {
    const prefix = index === 0 ? "" : "\u2191 ";
    lines.push(prefix + oneLine(result, key));
    pushIncidentLines(lines, incidents.get(key), index === 0 ? "  " : "  ");
  });
}
function renderFlat(lines, result, incidents) {
  for (const key of result.keys) {
    lines.push(oneLine(result, key));
    pushIncidentLines(lines, incidents.get(key), "  ");
  }
}
function renderTree(lines, result, incidents) {
  lines.push(oneLine(result, result.rootKey));
  pushIncidentLines(lines, incidents.get(result.rootKey), "  ");
  const descend = (parentKey, prefix) => {
    const children = result.edges.get(parentKey) ?? [];
    children.forEach((childKey, index) => {
      const last = index === children.length - 1;
      lines.push(`${prefix}${last ? "\u2514\u2500 " : "\u251C\u2500 "}${oneLine(result, childKey)}`);
      pushIncidentLines(lines, incidents.get(childKey), `${prefix}${last ? "   " : "\u2502  "}   `);
      descend(childKey, `${prefix}${last ? "   " : "\u2502  "}`);
    });
  };
  descend(result.rootKey, "");
}
function pushIncidentLines(lines, incidents, indent) {
  if (!incidents || incidents.length === 0) return;
  for (const inc of incidents) {
    const parts = [inc.errorType ?? "INCIDENT"];
    if (inc.elementId) parts.push(`@${inc.elementId}`);
    if (inc.errorMessage) parts.push(`\u2014 ${inc.errorMessage}`);
    lines.push(`${indent}! ${parts.join(" ")}`);
  }
}
function oneLine(result, key) {
  const pi = result.chain.get(key);
  if (!pi) return `${key} (not found)`;
  const parts = [pi.processInstanceKey];
  if (pi.state) parts.push(pi.state);
  if (pi.processDefinitionId) {
    parts.push(
      pi.processDefinitionVersion ? `${pi.processDefinitionId} v${pi.processDefinitionVersion}` : pi.processDefinitionId
    );
  }
  if (pi.hasIncident) parts.push("\u26A0");
  const markers = [];
  if (key === result.seedKey && result.mode === "family" && result.rootKey !== result.seedKey) {
    markers.push("seed");
  }
  if (key === result.missingAncestor && !seedExists(result, key)) markers.push("missing");
  const suffix = markers.length > 0 ? ` (${markers.join(", ")})` : "";
  return parts.join("  ") + suffix;
}
function seedExists(result, key) {
  const pi = result.chain.get(key);
  return pi !== void 0 && pi.state !== void 0;
}

// src/cli.ts
var ROUTES = {
  "execute/smoke-test": run7,
  "execute/retention-policy": run6,
  "purge/orphan-process-instances": run3,
  "purge/process-instances-with-incidents": run2,
  "purge/all-process-definitions": run,
  "repair/incident": run4,
  "repair/process-instance": run5,
  "walk/process-instance": run8
};
var ALIASES = {
  "smoke-test": "execute/smoke-test",
  smoketest: "execute/smoke-test",
  "retention-policy": "execute/retention-policy",
  retention: "execute/retention-policy",
  "orphan-process-instances": "purge/orphan-process-instances",
  orphans: "purge/orphan-process-instances",
  "process-instances-with-incidents": "purge/process-instances-with-incidents",
  incidents: "purge/process-instances-with-incidents",
  "all-process-definitions": "purge/all-process-definitions",
  definitions: "purge/all-process-definitions",
  "repair-incident": "repair/incident",
  "repair-process-instance": "repair/process-instance",
  walk: "walk/process-instance",
  "walk-process-instance": "walk/process-instance"
};
function listRoutes() {
  return Object.keys(ROUTES);
}
function resolvePlaybook(args) {
  const [verb, resource] = args;
  if (!verb) {
    throw usageError();
  }
  const aliasKey = ALIASES[verb];
  const aliasRun = aliasKey ? ROUTES[aliasKey] : void 0;
  if (aliasKey && aliasRun && (!resource || !ROUTES[`${verb}/${resource}`])) {
    return { key: aliasKey, run: aliasRun };
  }
  const key = resource ? `${verb}/${resource}` : "";
  const run9 = ROUTES[key];
  if (!run9) {
    throw usageError(verb, resource);
  }
  return { key, run: run9 };
}
function usageError(verb, resource) {
  const attempted = [verb, resource].filter(Boolean).join(" ");
  const known = listRoutes().map((k) => `ops ${k.replace("/", " ")}`).join("\n  ");
  const prefix = attempted ? `unknown ops command: ${attempted}

` : "missing ops command\n\n";
  return new Error(`${prefix}Available commands:
  ${known}`);
}
function bool(value) {
  return value === true;
}
function int(value, fallback) {
  const n = num(value);
  return n === void 0 ? fallback : Math.trunc(n);
}
function intOrUndefined(value) {
  const n = num(value);
  return n === void 0 ? void 0 : Math.trunc(n);
}
function coerceFlags(flags2 = {}) {
  const reportFormat = str(flags2["report-format"]);
  return {
    limit: Math.max(0, int(flags2.limit, 0)),
    batchSize: Math.max(1, int(flags2["batch-size"], 100)),
    autoConfirm: bool(flags2["auto-confirm"]),
    automation: bool(flags2.automation),
    force: bool(flags2.force),
    noWait: bool(flags2["no-wait"]),
    workers: intOrUndefined(flags2.workers),
    noWorkerLimit: bool(flags2["no-worker-limit"]),
    failFast: bool(flags2["fail-fast"]),
    reportFile: str(flags2["report-file"]),
    reportFormat: reportFormat === "json" ? "json" : reportFormat === "markdown" ? "markdown" : void 0,
    raw: {
      retentionDays: intOrUndefined(flags2["retention-days"]),
      state: str(flags2.state),
      incidentState: str(flags2["incident-state"]),
      bpmnProcessId: str(flags2["bpmn-process-id"]),
      pdKey: str(flags2["pd-key"]),
      piKey: str(flags2["pi-key"]),
      parentKey: str(flags2["parent-key"]),
      errorType: str(flags2["error-type"]),
      elementId: str(flags2["element-id"]),
      latest: bool(flags2.latest),
      key: str(flags2.key),
      retries: intOrUndefined(flags2.retries),
      jobTimeoutMs: intOrUndefined(flags2["job-timeout-ms"]),
      vars: str(flags2.vars),
      count: intOrUndefined(flags2.count),
      noCleanup: bool(flags2["no-cleanup"]),
      parent: bool(flags2.parent),
      children: bool(flags2.children),
      flat: bool(flags2.flat),
      withIncidents: bool(flags2["with-incidents"])
    }
  };
}
async function dispatch(args, flags2) {
  const { run: run9 } = resolvePlaybook(args);
  const ctx = new OpsContext(coerceFlags(flags2));
  await run9(ctx);
}

// src/index.ts
var flags = {
  // Discovery / paging
  limit: { type: "string", description: "Cap the frozen candidate scope (0 = uncapped)" },
  "batch-size": { type: "string", description: "Search page size during discovery", short: "b" },
  // Execution controls
  "auto-confirm": { type: "boolean", description: "Skip the confirmation prompt for mutations" },
  automation: { type: "boolean", description: "Non-interactive mode: proceed without prompting" },
  force: { type: "boolean", description: "Cancel non-final/active instances before deleting" },
  "no-wait": {
    type: "boolean",
    description: "Return once mutations are accepted, without confirming completion"
  },
  workers: {
    type: "string",
    description: "Max concurrent workers (default: min(count, 2*cpus, 32))",
    short: "w"
  },
  "no-worker-limit": {
    type: "boolean",
    description: "Use one worker per item when --workers is unset"
  },
  "fail-fast": { type: "boolean", description: "Stop scheduling work after the first error" },
  // Reporting
  "report-file": { type: "string", description: "Write an audit report to the given path" },
  "report-format": {
    type: "string",
    description: "Audit report format: markdown or json (default inferred from extension)"
  },
  // Selection / filters (playbook-specific)
  "retention-days": {
    type: "string",
    description: "retention-policy: delete finished instances at least N days old"
  },
  state: {
    type: "string",
    description: "Process-instance or incident state filter (default per playbook)",
    short: "s"
  },
  "incident-state": {
    type: "string",
    description: "Incident state filter for repair/purge-by-incident (default active)"
  },
  "bpmn-process-id": { type: "string", description: "Filter by BPMN process id" },
  "pd-key": { type: "string", description: "Filter by process-definition key" },
  "pi-key": { type: "string", description: "Filter by process-instance key" },
  "parent-key": { type: "string", description: "Filter by parent process-instance key" },
  "error-type": { type: "string", description: "Filter incidents by error type" },
  "element-id": { type: "string", description: "Filter incidents by BPMN element id" },
  latest: {
    type: "boolean",
    description: "purge definitions: only the latest version of each definition"
  },
  key: {
    type: "string",
    description: "Explicit key(s) to target, comma-separated (incident or process-instance)",
    short: "k"
  },
  retries: {
    type: "string",
    description: "repair: job retries to set (default 1; 0 skips the retry update)"
  },
  "job-timeout-ms": { type: "string", description: "repair: job timeout to set, in milliseconds" },
  vars: {
    type: "string",
    description: "repair: JSON object of variables to set once per process-instance scope"
  },
  count: {
    type: "string",
    description: "smoke-test: number of process instances to start (default 1)",
    short: "n"
  },
  "no-cleanup": {
    type: "boolean",
    description: "smoke-test: retain deployed/created resources instead of deleting them"
  },
  // Walk (read-only relationship inspection)
  parent: {
    type: "boolean",
    description: "walk: show the ancestry chain from the key up to its root"
  },
  children: {
    type: "boolean",
    description: "walk: show the key and all of its descendants"
  },
  flat: {
    type: "boolean",
    description: "walk: render the family as a flat list instead of an ASCII tree"
  },
  "with-incidents": {
    type: "boolean",
    description: "walk: annotate rows with their active incidents"
  }
};
async function handler(args, commandFlags) {
  try {
    await dispatch(args, commandFlags);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      runtime().getLogger().error(message);
    } catch {
      console.error(message);
    }
    process.exitCode = 1;
  }
}
var commands = {
  ops: { flags, handler }
};
var metadata = {
  name: "c8ctl-ops-plugin",
  commands: {
    ops: {
      description: "High-level Camunda 8 operations playbooks (smoke-test, retention, purge, repair, walk)",
      examples: [
        {
          command: "c8ctl ops execute smoke-test --dry-run",
          description: "Preview an end-to-end connectivity smoke test"
        },
        {
          command: "c8ctl ops execute smoke-test -n 5 --auto-confirm",
          description: "Deploy a fixture, start 5 instances, walk families, then clean up"
        },
        {
          command: "c8ctl ops execute retention-policy --retention-days 30 --dry-run",
          description: "Preview deletion of finished instances older than 30 days"
        },
        {
          command: "c8ctl ops purge orphan-process-instances --dry-run",
          description: "Find orphan child instances whose parent is gone"
        },
        {
          command: "c8ctl ops purge process-instances-with-incidents --force --auto-confirm",
          description: "Delete instance families that have incidents"
        },
        {
          command: "c8ctl ops purge all-process-definitions --latest --dry-run",
          description: "Preview deletion of the latest process definitions and their impact"
        },
        {
          command: "c8ctl ops repair incident --error-type IO_MAPPING_ERROR --retries 3",
          description: "Resolve matching incidents, bumping job retries to 3"
        },
        {
          command: `c8ctl ops repair process-instance --key 2251799813685249 --vars '{"ok":true}'`,
          description: "Set variables then resolve incidents for a process instance"
        },
        {
          command: "c8ctl ops walk process-instance --key 2251799813685249",
          description: "Show the full process-instance family as an ASCII tree"
        },
        {
          command: "c8ctl ops walk process-instance --key 2251799813685249 --parent",
          description: "Show the ancestry chain from a key up to its root"
        },
        {
          command: "c8ctl ops walk process-instance --key 2251799813685249 --children --with-incidents",
          description: "List descendants of a key, annotated with active incidents"
        }
      ]
    }
  }
};
export {
  commands,
  metadata
};
