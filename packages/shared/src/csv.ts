/** Splits a comma-separated value into trimmed, non-empty entries. */
export function parseCsv(value: string | null | undefined): string[] {
	if (!value) {
		return [];
	}
	return value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

export function serializeCsv(values: readonly string[]): string {
	return values.join(",");
}
