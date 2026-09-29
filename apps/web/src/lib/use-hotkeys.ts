import { useEffect, useRef } from "react";

const SEQUENCE_TIMEOUT_MS = 1000;

export type HotkeyHandlers = Record<string, (event: KeyboardEvent) => void>;

function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}
	if (target.isContentEditable) {
		return true;
	}
	const tag = target.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function hasOpenDialog(): boolean {
	return document.querySelector("[role='dialog']") !== null;
}

export function useHotkeys(handlers: HotkeyHandlers) {
	const handlersRef = useRef(handlers);
	const pendingRef = useRef<{ combo: string; at: number } | null>(null);

	useEffect(() => {
		handlersRef.current = handlers;
	}, [handlers]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.repeat) {
				return;
			}
			if (event.metaKey || event.ctrlKey || event.altKey) {
				return;
			}
			if (isTypingTarget(event.target) || hasOpenDialog()) {
				return;
			}
			const handlers = handlersRef.current;
			const pending = pendingRef.current;
			const now = Date.now();
			if (pending) {
				pendingRef.current = null;
				if (now - pending.at <= SEQUENCE_TIMEOUT_MS) {
					const sequence = handlers[`${pending.combo}${event.key}`];
					if (sequence) {
						event.preventDefault();
						sequence(event);
						return;
					}
				}
			}
			const single = handlers[event.key];
			if (single) {
				event.preventDefault();
				single(event);
				return;
			}
			if (
				Object.keys(handlers).some((key) => key.startsWith(`${event.key} `))
			) {
				pendingRef.current = { combo: `${event.key} `, at: now };
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, []);
}
