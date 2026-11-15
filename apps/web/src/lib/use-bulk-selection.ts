import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Multi-select state for a list of rows identified by id.
 *
 * `resetKey` is the identity of the current result set (loaded data or the
 * effective query). When it changes the selection is cleared so a filter or
 * view change cannot leave invisible rows selected. `toggleAll` merges over
 * the currently visible `ids`, so callers that page manually keep selections
 * from other pages until they call `clear`.
 */
export function useBulkSelection({
	ids,
	resetKey,
}: {
	ids: readonly string[];
	resetKey?: unknown;
}) {
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const lastResetKey = useRef(resetKey);

	useEffect(() => {
		if (Object.is(lastResetKey.current, resetKey)) {
			return;
		}
		lastResetKey.current = resetKey;
		setSelected(new Set());
	}, [resetKey]);

	const toggleOne = useCallback((id: string, checked: boolean) => {
		setSelected((previous) => {
			const next = new Set(previous);
			if (checked) {
				next.add(id);
			} else {
				next.delete(id);
			}
			return next;
		});
	}, []);

	const toggleAll = useCallback(
		(checked: boolean) => {
			setSelected((previous) => {
				const next = new Set(previous);
				for (const id of ids) {
					if (checked) {
						next.add(id);
					} else {
						next.delete(id);
					}
				}
				return next;
			});
		},
		[ids],
	);

	const clear = useCallback(() => {
		setSelected(new Set());
	}, []);

	return { selected, toggleOne, toggleAll, clear };
}
