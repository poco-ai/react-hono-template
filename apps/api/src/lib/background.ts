import type { Context } from "hono";

export type BackgroundFn = (fn: () => Promise<void>) => void;

export const backgroundFromContext =
	(c: Context): BackgroundFn =>
	(fn) => {
		try {
			c.executionCtx.waitUntil(fn());
		} catch {
			fn().catch((err) => console.error("[background] task failed:", err));
		}
	};
