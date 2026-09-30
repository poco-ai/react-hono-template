// Feature data modules use the real i18n instance. Tests only need language detection.
Object.defineProperty(globalThis, "localStorage", {
	configurable: true,
	value: { getItem: () => null },
});
Object.defineProperty(globalThis, "navigator", {
	configurable: true,
	value: { language: "en" },
});

// The auth SDK captures fetch during initialization; route that call to the
// current test transport so individual request tests can replace and restore it.
const originalFetch = globalThis.fetch;
const forwardFetch: typeof fetch = Object.assign(
	(...args: Parameters<typeof fetch>) =>
		globalThis.fetch === forwardFetch
			? originalFetch(...args)
			: globalThis.fetch(...args),
	{ preconnect: originalFetch.preconnect },
);
globalThis.fetch = forwardFetch;
