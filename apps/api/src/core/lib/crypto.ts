const toHex = (bytes: Uint8Array) =>
	Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const sha256Hex = async (value: string) => {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);
	return toHex(new Uint8Array(digest));
};

export const randomHex = (byteLength: number) =>
	toHex(crypto.getRandomValues(new Uint8Array(byteLength)));

export const randomBase64Url = (byteLength: number) => {
	const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
};
