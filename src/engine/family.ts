/**
 * Process-instance family expansion and delete planning.
 *
 * A "family" is the root ancestor of a seed instance plus all of its
 * descendants. Deleting a root cascades over the tree, so plans resolve seeds
 * up to their roots, then expand roots down to every descendant to compute the
 * true affected scope and whether any of it is still non-final (which requires
 * cancel-before-delete via --force).
 */
import { type C8Api, type ProcessInstance, isTerminal } from "./api.ts";
import { runPool } from "./pool.ts";
import { unique } from "./util.ts";

export interface AncestryResult {
	startKey: string;
	rootKey: string;
	root?: ProcessInstance;
	missingAncestor?: string;
	orphaned: boolean;
}

export interface FamilyDeletePlan {
	seedKeys: string[];
	resolvedRootKeys: string[];
	affectedKeys: string[];
	duplicateRootKeys: string[];
	finalStateKeys: string[];
	nonFinalAffectedKeys: string[];
	skippedSeedKeys: string[];
	missingAncestors: string[];
	requiresCancelBeforeDelete: boolean;
}

const MAX_DEPTH = 1000;

/** Walk parent-by-parent from a seed to its root. */
export async function resolveAncestry(api: C8Api, startKey: string): Promise<AncestryResult> {
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
			// Parent referenced but not found: seed belongs to an orphaned subtree.
			return {
				startKey,
				rootKey: currentKey,
				root: current,
				orphaned: true,
				missingAncestor: parentKey,
			};
		}
		currentKey = parentKey;
		current = parent;
	}
	return { startKey, rootKey: currentKey, root: current, orphaned: false };
}

/** Collect a root and every descendant (root-first, breadth-first). */
export async function collectDescendants(api: C8Api, rootKey: string): Promise<ProcessInstance[]> {
	const root = await api.getProcessInstance(rootKey);
	const collected: ProcessInstance[] = root ? [root] : [{ processInstanceKey: rootKey }];
	const seen = new Set<string>([rootKey]);
	const queue: string[] = [rootKey];
	while (queue.length > 0) {
		const key = queue.shift();
		if (key === undefined) break;
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

export async function planFamilyDelete(
	api: C8Api,
	seedKeys: readonly string[],
	{
		workers,
		failFast,
		includeNonFinalRoots,
	}: { workers: number; failFast: boolean; includeNonFinalRoots: boolean },
): Promise<FamilyDeletePlan> {
	const seeds = unique(seedKeys);
	const ancestryResults = await runPool(seeds, { workers, failFast }, (key) =>
		resolveAncestry(api, key),
	);

	const roots: string[] = [];
	const skippedSeedKeys: string[] = [];
	const missingAncestors: string[] = [];
	const seenRoots = new Set<string>();
	const duplicateRootKeys: string[] = [];

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

	const descendantResults = await runPool(roots, { workers, failFast }, (rootKey) =>
		collectDescendants(api, rootKey),
	);

	const affected: ProcessInstance[] = [];
	const affectedSeen = new Set<string>();
	for (const r of descendantResults) {
		for (const pi of r.value ?? []) {
			if (affectedSeen.has(pi.processInstanceKey)) continue;
			affectedSeen.add(pi.processInstanceKey);
			affected.push(pi);
		}
	}

	const nonFinalAffectedKeys = affected
		.filter((pi) => !isTerminal(pi.state))
		.map((pi) => pi.processInstanceKey);
	const finalStateKeys = affected
		.filter((pi) => isTerminal(pi.state))
		.map((pi) => pi.processInstanceKey);

	return {
		seedKeys: seeds,
		resolvedRootKeys: unique(roots),
		affectedKeys: affected.map((pi) => pi.processInstanceKey),
		duplicateRootKeys: unique(duplicateRootKeys),
		finalStateKeys,
		nonFinalAffectedKeys,
		skippedSeedKeys: unique(skippedSeedKeys),
		missingAncestors: unique(missingAncestors),
		requiresCancelBeforeDelete: nonFinalAffectedKeys.length > 0,
	};
}

export interface DeleteReport {
	rootKey: string;
	canceled: boolean;
	deleted: boolean;
	error?: string;
}

/**
 * Execute a family delete plan against the resolved roots. When `force` is set,
 * non-final roots are cancelled before deletion; otherwise a delete is issued
 * directly (the caller is expected to have blocked on non-final scope already).
 */
export async function executeFamilyDelete(
	api: C8Api,
	plan: FamilyDeletePlan,
	{ workers, failFast, force }: { workers: number; failFast: boolean; force: boolean },
): Promise<DeleteReport[]> {
	const nonFinal = new Set(plan.nonFinalAffectedKeys);
	const results = await runPool(plan.resolvedRootKeys, { workers, failFast }, async (rootKey) => {
		const report: DeleteReport = { rootKey, canceled: false, deleted: false };
		if (force && nonFinal.has(rootKey)) {
			await api.cancelProcessInstance(rootKey);
			report.canceled = true;
		}
		await api.deleteProcessInstance(rootKey);
		report.deleted = true;
		return report;
	});
	return results.map(
		(r) => r.value ?? { rootKey: r.item, canceled: false, deleted: false, error: r.error?.message },
	);
}
