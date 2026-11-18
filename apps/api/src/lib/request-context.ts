import { AsyncLocalStorage } from "node:async_hooks";

export type RequestMeta = {
	requestId: string;
	ipAddress: string | null;
	userAgent: string | null;
};

const requestMeta = new AsyncLocalStorage<RequestMeta>();

export const currentRequestMeta = (): RequestMeta | undefined =>
	requestMeta.getStore();

export const runWithRequestMeta = <T>(
	meta: RequestMeta,
	fn: () => Promise<T>,
): Promise<T> => requestMeta.run(meta, fn);
