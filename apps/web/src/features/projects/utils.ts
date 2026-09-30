export function projectKeyFromName(name: string): string {
	const words = name
		.toUpperCase()
		.replace(/[^A-Z ]/g, " ")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	const initials = words.map((word) => word[0]).join("");
	const key =
		initials.length >= 2 ? initials.slice(0, 6) : words.join("").slice(0, 3);
	return /^[A-Z]{2,6}$/.test(key) ? key : "";
}
