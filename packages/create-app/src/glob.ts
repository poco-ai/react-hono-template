/**
 * Minimal glob matcher with the same semantics as
 * `apps/api/tests/architecture.test.ts`: `**` spans path segments, `*` and `?`
 * stay inside one segment. Claim globs are relative POSIX paths.
 */
export function globToRegExp(pattern: string): RegExp {
	let source = "";
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		if (char === "*") {
			if (pattern[i + 1] === "*") {
				source += ".*";
				i++;
			} else {
				source += "[^/]*";
			}
		} else if (char === "?") {
			source += "[^/]";
		} else {
			source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
		}
	}
	return new RegExp(`^${source}$`);
}

/** True when a claimed glob could name a file that still needs removal. */
export function matchesAny(
	relPath: string,
	patterns: readonly RegExp[],
): boolean {
	return patterns.some((pattern) => pattern.test(relPath));
}
