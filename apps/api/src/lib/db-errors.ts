const errorMessageChain = (err: unknown): string[] => {
	const messages: string[] = [];
	const seen = new Set<Error>();
	let current: unknown = err;
	while (current instanceof Error && !seen.has(current)) {
		messages.push(current.message);
		seen.add(current);
		current = (current as { cause?: unknown }).cause;
	}
	return messages;
};

/**
 * SQLite reports unique-index clashes as a "UNIQUE constraint failed" error.
 * Drivers wrap it (drizzle-orm wraps the SQLiteError in a DrizzleQueryError),
 * so the cause chain is inspected too. Note: this deliberately matches UNIQUE
 * violations only — FOREIGN KEY / CHECK constraint failures must not be
 * treated as retryable uniqueness races.
 */
export const isUniqueConstraintViolation = (err: unknown): boolean =>
	errorMessageChain(err).some((message) =>
		/unique constraint failed/i.test(message),
	);

/**
 * The only retryable issue insert race is the per-project number allocation
 * (`issues.project_id, issues.number`). Label-link and other unique failures
 * are caller errors and must surface immediately.
 */
export const isIssueNumberConflict = (err: unknown): boolean =>
	errorMessageChain(err).some((message) =>
		/unique constraint failed:\s*issues\.(?:project_id|number)/i.test(message),
	);
