/**
 * Bun/happy-dom expose `preconnect` on the global fetch function, but the DOM
 * lib types only declare the call signature. Tests copy that property when
 * swapping fetch transports, so expose it on function values for the test
 * project only.
 */
interface Function {
	preconnect?: (url: string) => void;
}
