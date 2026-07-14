/** Generic paged discovery: pages through a search endpoint, capping at --limit. */

import type { Page } from "./api.ts";
import { type DiscoveryScopeStatus, discoveryScope } from "./types.ts";

export interface DiscoveryResult<T> {
	items: T[];
	scope: DiscoveryScopeStatus;
}

/**
 * Page through `fetchPage` until the endpoint is exhausted or `limit` frozen
 * candidates are collected. `batchSize` only tunes page size; `limit` (0 =
 * uncapped) is the explicit way to cap the frozen scope.
 */
export async function discoverAll<T>(
	fetchPage: (limit: number, after?: string) => Promise<Page<T>>,
	{ limit, batchSize }: { limit: number; batchSize: number },
): Promise<DiscoveryResult<T>> {
	const items: T[] = [];
	let after: string | undefined;
	let pages = 0;
	let seen = 0;
	const seenCursors = new Set<string>();

	for (;;) {
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
		scope: discoveryScope(seen, items.length, pages, limit, batchSize),
	};
}

/**
 * Like {@link discoverAll} but keeps only items for which `predicate` resolves
 * truthy, and caps the frozen scope at `limit` *kept* items (not raw items).
 * Used by orphan discovery, where candidates are filtered per page.
 */
export async function discoverWhere<T>(
	fetchPage: (limit: number, after?: string) => Promise<Page<T>>,
	predicate: (item: T) => Promise<boolean> | boolean,
	{ limit, batchSize }: { limit: number; batchSize: number },
): Promise<DiscoveryResult<T>> {
	const items: T[] = [];
	let after: string | undefined;
	let pages = 0;
	let seen = 0;
	const seenCursors = new Set<string>();

	for (;;) {
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
		scope: discoveryScope(seen, items.length, pages, limit, batchSize),
	};
}
