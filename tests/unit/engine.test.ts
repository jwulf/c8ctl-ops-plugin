import assert from "node:assert/strict";
import { test } from "node:test";
import type { C8Api, Page, ProcessInstance } from "../../src/engine/api.ts";
import { discoverAll, discoverWhere } from "../../src/engine/discovery.ts";
import { planFamilyDelete } from "../../src/engine/family.ts";
import { determineWorkers, runPool } from "../../src/engine/pool.ts";
import { keyList, num, parseJsonObject, str, unique } from "../../src/engine/util.ts";

test("util: keyList splits and trims", () => {
	assert.deepEqual(keyList("a, b ,,c"), ["a", "b", "c"]);
	assert.deepEqual(keyList(["x", "", "y"]), ["x", "y"]);
	assert.deepEqual(keyList(undefined), []);
});

test("util: unique preserves order and drops empties", () => {
	assert.deepEqual(unique(["a", "b", "a", "", "c"]), ["a", "b", "c"]);
});

test("util: num and str coercion", () => {
	assert.equal(num("42"), 42);
	assert.equal(num("x"), undefined);
	assert.equal(str(7), "7");
	assert.equal(str({}), undefined);
});

test("util: parseJsonObject validates", () => {
	assert.deepEqual(parseJsonObject('{"a":1}', "vars"), { a: 1 });
	assert.throws(() => parseJsonObject("[1]", "vars"), /must be a JSON object/);
	assert.throws(() => parseJsonObject("nope", "vars"), /must be valid JSON/);
});

function pageFactory(
	total: number,
	size: number,
): (limit: number, after?: string) => Promise<Page<{ id: number }>> {
	return async (limit, after) => {
		const start = after ? Number(after) : 0;
		const items = [];
		for (let i = start; i < Math.min(start + Math.min(limit, size), total); i++) {
			items.push({ id: i });
		}
		const end = start + items.length;
		return { items, endCursor: String(end), totalItems: total, hasMore: end < total };
	};
}

test("discovery: discoverAll pages the full scope", async () => {
	const result = await discoverAll(pageFactory(25, 10), { limit: 0, batchSize: 10 });
	assert.equal(result.items.length, 25);
	assert.equal(result.scope.complete, true);
	assert.equal(result.scope.limited, false);
});

test("discovery: discoverAll honors limit", async () => {
	const result = await discoverAll(pageFactory(100, 10), { limit: 15, batchSize: 10 });
	assert.equal(result.items.length, 15);
	assert.equal(result.scope.limited, true);
});

test("discovery: discoverWhere filters and caps kept items", async () => {
	const result = await discoverWhere(pageFactory(40, 10), (item) => item.id % 2 === 0, {
		limit: 5,
		batchSize: 10,
	});
	assert.equal(result.items.length, 5);
	assert.ok(result.items.every((i) => i.id % 2 === 0));
});

test("pool: determineWorkers respects overrides", () => {
	assert.equal(determineWorkers(0, undefined, false), 1);
	assert.equal(determineWorkers(100, 4, false), 4);
	assert.equal(determineWorkers(3, 10, false), 3);
	assert.equal(determineWorkers(5, undefined, true), 5);
});

test("pool: runPool collects values and errors without fail-fast", async () => {
	const results = await runPool([1, 2, 3], { workers: 2, failFast: false }, async (n) => {
		if (n === 2) throw new Error("boom");
		return n * 2;
	});
	assert.equal(results[0]?.value, 2);
	assert.equal(results[1]?.error?.message, "boom");
	assert.equal(results[2]?.value, 6);
});

function fakeApi(instances: Record<string, ProcessInstance>): C8Api {
	const byParent = new Map<string, ProcessInstance[]>();
	for (const pi of Object.values(instances)) {
		if (pi.parentProcessInstanceKey) {
			const list = byParent.get(pi.parentProcessInstanceKey) ?? [];
			list.push(pi);
			byParent.set(pi.parentProcessInstanceKey, list);
		}
	}
	const api = {
		async getProcessInstance(key: string) {
			return instances[key];
		},
		async childrenOf(key: string) {
			return byParent.get(key) ?? [];
		},
	};
	return api as unknown as C8Api;
}

test("family: planFamilyDelete resolves roots and affected scope", async () => {
	const api = fakeApi({
		root: { processInstanceKey: "root", state: "COMPLETED" },
		child: { processInstanceKey: "child", parentProcessInstanceKey: "root", state: "COMPLETED" },
		grand: { processInstanceKey: "grand", parentProcessInstanceKey: "child", state: "COMPLETED" },
	});
	const plan = await planFamilyDelete(api, ["grand"], {
		workers: 2,
		failFast: false,
		includeNonFinalRoots: false,
	});
	assert.deepEqual(plan.resolvedRootKeys, ["root"]);
	assert.equal(plan.affectedKeys.length, 3);
	assert.equal(plan.requiresCancelBeforeDelete, false);
});

test("family: non-final root is skipped unless included", async () => {
	const api = fakeApi({
		root: { processInstanceKey: "root", state: "ACTIVE" },
	});
	const skipped = await planFamilyDelete(api, ["root"], {
		workers: 1,
		failFast: false,
		includeNonFinalRoots: false,
	});
	assert.deepEqual(skipped.resolvedRootKeys, []);
	assert.deepEqual(skipped.skippedSeedKeys, ["root"]);

	const included = await planFamilyDelete(api, ["root"], {
		workers: 1,
		failFast: false,
		includeNonFinalRoots: true,
	});
	assert.deepEqual(included.resolvedRootKeys, ["root"]);
	assert.equal(included.requiresCancelBeforeDelete, true);
});
