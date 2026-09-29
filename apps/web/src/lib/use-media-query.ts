import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(
		() => window.matchMedia(query).matches,
	);

	useEffect(() => {
		const mediaQuery = window.matchMedia(query);
		const onChange = (event: MediaQueryListEvent) => {
			setMatches(event.matches);
		};
		setMatches(mediaQuery.matches);
		mediaQuery.addEventListener("change", onChange);
		return () => mediaQuery.removeEventListener("change", onChange);
	}, [query]);

	return matches;
}
