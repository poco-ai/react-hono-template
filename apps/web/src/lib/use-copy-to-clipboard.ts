import { useCallback, useEffect, useRef, useState } from "react";

/** Matches the feedback timing the copy buttons used before this hook. */
const DEFAULT_FEEDBACK_DURATION = 1600;

/** Copies text and exposes short-lived success state for inline feedback. */
export function useCopyToClipboard({
	feedbackDuration = DEFAULT_FEEDBACK_DURATION,
	onError,
}: {
	feedbackDuration?: number;
	onError?: (error: unknown) => void;
} = {}) {
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const mountedRef = useRef(true);

	const clearTimer = useCallback(() => {
		if (timeoutRef.current !== null) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
	}, []);

	const reset = useCallback(() => {
		clearTimer();
		setCopied(false);
	}, [clearTimer]);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			clearTimer();
		};
	}, [clearTimer]);

	const copy = useCallback(
		async (value: string) => {
			try {
				await navigator.clipboard.writeText(value);
			} catch (error) {
				clearTimer();
				setCopied(false);
				onError?.(error);
				return false;
			}
			if (!mountedRef.current) {
				return true;
			}
			clearTimer();
			setCopied(true);
			timeoutRef.current = setTimeout(() => {
				setCopied(false);
				timeoutRef.current = null;
			}, feedbackDuration);
			return true;
		},
		[clearTimer, feedbackDuration, onError],
	);

	return { copied, copy, reset };
}
