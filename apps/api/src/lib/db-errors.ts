/**
 * SQLite reports unique-index clashes as a "UNIQUE constraint failed" error.
 * Drivers wrap it (drizzle-orm wraps the SQLiteError in a DrizzleQueryError),
 * so the cause chain is inspected too. Note: this deliberately matches UNIQUE
 * violations only — FOREIGN KEY / CHECK constraint failures must not be
 * treated as retryable uniqueness races.
 */
export const isUniqueConstraintViolation = (err: unknown): boolean => {
	const seen = new Set<Error>();
	let current: unknown = err;
	while (current instanceof Error && !seen.has(current)) {
		if (/unique constraint failed/i.test(current.message)) {
			return true;
		}
		seen.add(current);
		current = (current as { cause?: unknown }).cause;
	}
	return false;
};
