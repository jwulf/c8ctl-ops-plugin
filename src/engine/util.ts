/** Small type-narrowing helpers shared across the ops engine. */

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Narrow unknown to a record, returning an empty object for non-records. */
export function asRecord(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

/** Coerce a value to a string if it is a string/number/bigint, else undefined. */
export function str(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "bigint") return String(value);
	return undefined;
}

/** Coerce a value to a number if it is a finite number/bigint/numeric string. */
export function num(value: unknown): number | undefined {
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	if (typeof value === "bigint") return Number(value);
	if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		return Number.isFinite(n) ? n : undefined;
	}
	return undefined;
}

/** Deduplicate a list of strings preserving first-seen order. */
export function unique(keys: readonly string[]): string[] {
	return [...new Set(keys.filter((k) => k !== ""))];
}

/** Parse a required non-negative integer flag value. */
export function parseIntFlag(
	value: string | undefined,
	name: string,
	{ min = 0 }: { min?: number } = {},
): number | undefined {
	if (value === undefined) return undefined;
	const n = Number(value);
	if (!Number.isInteger(n) || n < min) {
		throw new Error(`Invalid value for --${name}: ${value} (expected integer >= ${min})`);
	}
	return n;
}

/** Parse JSON object flag value (for --vars). */
export function parseJsonObject(value: string, name: string): Record<string, unknown> {
	let parsed: unknown;
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

/** Split a comma-separated / array flag value into a clean list of keys. */
export function keyList(value: unknown): string[] {
	if (typeof value === "string") {
		return value
			.split(",")
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
	}
	if (Array.isArray(value)) {
		return value.filter((v): v is string => typeof v === "string" && v.length > 0);
	}
	return [];
}
