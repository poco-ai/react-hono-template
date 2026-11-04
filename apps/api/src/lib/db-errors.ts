/**
 * SQLite reports unique-index clashes as a "UNIQUE constraint failed" error.
 * Drivers wrap it (drizzle-orm wraps the SQLiteError in a DrizzleQueryError),
 * so the cause chain is inspected too. Note: this deliberately matches UNIQUE
 * violations only — FOREIGN KEY / CHECK constraint failures must not be
 * treated as retryable uniqueness races.
 */
export const isUniqueConstraintViolation = (err: unknown): boolean => {
	if (!(err instanceof Error)) {
		return false;
	}
	if (/unique constraint failed/i.test(err.message)) {
		return true;
	}
	const cause = (err as { cause?: unknown }).cause;
	return (
		cause !== undefined && cause !== err && isUniqueConstraintViolation(cause)
	);
};
