export function parseCsv(value: string | undefined): string[] {
	return value
		? value
				.split(",")
				.map((part) => part.trim())
				.filter(Boolean)
		: [];
}

export function serializeCsv(values: string[]): string {
	return values.join(",");
}
