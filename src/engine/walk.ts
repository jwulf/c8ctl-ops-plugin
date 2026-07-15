/**
 * Read-only process-instance relationship traversal for the `ops walk` command.
 *
 * Reuses the parent/child primitives the purge/repair engine already relies on
 * to answer three questions about a seed process-instance key:
 *   - parent   → the ancestry chain from the seed up to its root
 *   - children → the seed and every descendant beneath it
 *   - family   → the whole tree: the seed's root plus all of its descendants
 *
 * A traversal never mutates anything; it returns a chain (key → instance) plus
 * a parent→children edges map so callers can render an ASCII tree, a flat list,
 * or a JSON payload. When an ancestor is referenced but missing, the traversal
 * returns the partial result it could reach along with a warning, matching the
 * "strict single lookups, lenient family walks" contract.
 */
import type { C8Api, ProcessInstance } from "./api.ts";

export type WalkMode = "parent" | "children" | "family";

const MAX_DEPTH = 1000;

export const MISSING_ANCESTOR_WARNING = "one or more parent process instances were not found";

export interface WalkResult {
	mode: WalkMode;
	seedKey: string;
	rootKey: string;
	/** Included instance keys in deterministic order (seed-first for chains,
	 *  root-first breadth-first for trees). */
	keys: string[];
	chain: Map<string, ProcessInstance>;
	/** Parent key → ordered child keys (populated for tree modes). */
	edges: Map<string, string[]>;
	seedFound: boolean;
	orphaned: boolean;
	missingAncestor?: string;
	warning?: string;
}

interface AncestryPath {
	chain: Map<string, ProcessInstance>;
	keys: string[];
	rootKey: string;
	seedFound: boolean;
	orphaned: boolean;
	missingAncestor?: string;
}

/** Follow parentProcessInstanceKey from the seed up to its root. */
async function ancestryPath(api: C8Api, seedKey: string): Promise<AncestryPath> {
	const chain = new Map<string, ProcessInstance>();
	const keys: string[] = [];
	let currentKey = seedKey;
	let current = await api.getProcessInstance(currentKey);
	if (!current) {
		return {
			chain,
			keys,
			rootKey: seedKey,
			seedFound: false,
			orphaned: true,
			missingAncestor: seedKey,
		};
	}
	for (let depth = 0; depth < MAX_DEPTH; depth++) {
		chain.set(currentKey, current);
		keys.push(currentKey);
		const parentKey = current.parentProcessInstanceKey;
		if (!parentKey) {
			return { chain, keys, rootKey: currentKey, seedFound: true, orphaned: false };
		}
		const parent = await api.getProcessInstance(parentKey);
		if (!parent) {
			// Parent referenced but not found: the seed belongs to an orphaned subtree.
			return {
				chain,
				keys,
				rootKey: currentKey,
				seedFound: true,
				orphaned: true,
				missingAncestor: parentKey,
			};
		}
		currentKey = parentKey;
		current = parent;
	}
	return { chain, keys, rootKey: currentKey, seedFound: true, orphaned: false };
}

interface DescendantTree {
	chain: Map<string, ProcessInstance>;
	edges: Map<string, string[]>;
	keys: string[];
	rootFound: boolean;
}

/** Collect a root and every descendant breadth-first, recording tree edges. */
async function descendantTree(api: C8Api, rootKey: string): Promise<DescendantTree> {
	const chain = new Map<string, ProcessInstance>();
	const edges = new Map<string, string[]>();
	const keys: string[] = [];
	const root = await api.getProcessInstance(rootKey);
	chain.set(rootKey, root ?? { processInstanceKey: rootKey });
	keys.push(rootKey);
	const seen = new Set<string>([rootKey]);
	const queue: string[] = [rootKey];
	while (queue.length > 0) {
		const key = queue.shift();
		if (key === undefined) break;
		const children = await api.childrenOf(key);
		const childKeys: string[] = [];
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
	return { chain, edges, keys, rootFound: root !== undefined };
}

/** Traverse a seed process instance in the requested relationship mode. */
export async function walk(api: C8Api, seedKey: string, mode: WalkMode): Promise<WalkResult> {
	if (mode === "parent") {
		const a = await ancestryPath(api, seedKey);
		return {
			mode,
			seedKey,
			rootKey: a.rootKey,
			keys: a.keys,
			chain: a.chain,
			edges: new Map(),
			seedFound: a.seedFound,
			orphaned: a.orphaned,
			missingAncestor: a.missingAncestor,
			warning: a.missingAncestor ? MISSING_ANCESTOR_WARNING : undefined,
		};
	}

	if (mode === "children") {
		const d = await descendantTree(api, seedKey);
		return {
			mode,
			seedKey,
			rootKey: seedKey,
			keys: d.keys,
			chain: d.chain,
			edges: d.edges,
			seedFound: d.rootFound,
			orphaned: false,
			missingAncestor: d.rootFound ? undefined : seedKey,
			warning: d.rootFound ? undefined : MISSING_ANCESTOR_WARNING,
		};
	}

	// family: resolve the seed up to its root, then expand the root downward.
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
		warning: a.missingAncestor ? MISSING_ANCESTOR_WARNING : undefined,
	};
}
