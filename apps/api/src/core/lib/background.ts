import type { Context } from "hono";

export type BackgroundFn = (fn: () => Promise<void>) => void;

/** Fire-and-forget for the long-running server, where there is no `waitUntil`. */
export const detachBackground: BackgroundFn = (fn) => {
	fn().catch((err) => console.error("[background] task failed:", err));
};

export const backgroundFromContext =
	(c: Context): BackgroundFn =>
	(fn) => {
		try {
			c.executionCtx.waitUntil(fn());
		} catch {
			fn().catch((err) => console.error("[background] task failed:", err));
		}
	};
