/** Bounded-concurrency execution with optional fail-fast, used for batch mutations. */

import { availableParallelism } from "node:os";

export interface PoolOptions {
	workers: number;
	failFast: boolean;
}

export interface PoolItemResult<T, R> {
	item: T;
	value?: R;
	error?: Error;
}

/**
 * Determine the effective worker count.
 * Default: min(itemCount, 2*availableParallelism, 32). `noWorkerLimit` uses one
 * worker per item; an explicit positive `wanted` overrides both.
 */
export function determineWorkers(
	itemCount: number,
	wanted: number | undefined,
	noWorkerLimit: boolean,
): number {
	if (itemCount <= 0) return 1;
	if (wanted !== undefined && wanted > 0) return Math.min(wanted, itemCount);
	if (noWorkerLimit) return itemCount;
	const cpus = Math.max(1, availableParallelism());
	const cap = Math.min(2 * cpus, 32);
	return Math.max(1, Math.min(itemCount, cap));
}

export async function runPool<T, R>(
	items: readonly T[],
	options: PoolOptions,
	worker: (item: T, index: number) => Promise<R>,
): Promise<PoolItemResult<T, R>[]> {
	const results: PoolItemResult<T, R>[] = items.map((item) => ({ item }));
	if (items.length === 0) return results;

	const concurrency = Math.max(1, Math.min(options.workers, items.length));
	let next = 0;
	let aborted = false;

	async function pump(): Promise<void> {
		while (!aborted) {
			const index = next++;
			if (index >= items.length) return;
			const item = items[index];
			if (item === undefined) return;
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
