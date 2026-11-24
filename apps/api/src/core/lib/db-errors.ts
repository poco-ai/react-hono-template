const walkCauses = (err: unknown): unknown[] => {
	const nodes: unknown[] = [];
	const seen = new Set<unknown>();
	let current: unknown = err;
	while (current && typeof current === "object" && !seen.has(current)) {
		nodes.push(current);
		seen.add(current);
		current = (current as { cause?: unknown }).cause;
	}
	return nodes;
};

const errorMessageChain = (err: unknown): string[] =>
	walkCauses(err).flatMap((node) => {
		if (node instanceof Error) return [node.message];
		if (
			typeof node === "object" &&
			node !== null &&
			"message" in node &&
			typeof (node as { message?: unknown }).message === "string"
		) {
			return [(node as { message: string }).message];
		}
		return [];
	});

const UNIQUE_MESSAGE =
	/unique constraint failed|duplicate key value violates unique constraint/i;

const hasPostgresUniqueCode = (node: unknown) =>
	typeof node === "object" &&
	node !== null &&
	"code" in node &&
	(node as { code?: unknown }).code === "23505";

/**
 * SQLite reports unique-index clashes as a "UNIQUE constraint failed" error.
 * PostgreSQL reports "duplicate key value violates unique constraint" or code
 * 23505. Drivers wrap either one, so the cause chain is inspected too.
 * FOREIGN KEY / CHECK constraint failures must not be treated as retryable
 * uniqueness races.
 */
export const isUniqueConstraintViolation = (err: unknown): boolean => {
	const nodes = walkCauses(err);
	return (
		nodes.some(hasPostgresUniqueCode) ||
		errorMessageChain(err).some((message) => UNIQUE_MESSAGE.test(message))
	);
};

/**
 * The only retryable issue insert race is the per-project number allocation
 * (`issues.project_id, issues.number`). Label-link and other unique failures
 * are caller errors and must surface immediately.
 */
export const isIssueNumberConflict = (err: unknown): boolean =>
	errorMessageChain(err).some(
		(message) =>
			/unique constraint failed:\s*issues\.(?:project_id|number)/i.test(
				message,
			) || /issues_projectId_number_uq/i.test(message),
	);
