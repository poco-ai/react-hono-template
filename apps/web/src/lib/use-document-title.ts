import { useEffect } from "react";

const BASE_TITLE = "React Hono Template";

/**
 * Sets the document title for the current page. Server rendering is not used,
 * so the browser title is the only place a page name appears (the app does not
 * mount Router `HeadContent`).
 *
 * The cleanup deliberately does not reset to the bare app title: a route swap
 * unmounts the old page while the new one may already have claimed the title,
 * and resetting there would flash the base title. It only releases the title
 * when this page still owns it, restoring whatever was shown before.
 */
export function useDocumentTitle(title: string | undefined) {
	useEffect(() => {
		const next = title ? `${title} · ${BASE_TITLE}` : BASE_TITLE;
		const previous = document.title;
		document.title = next;
		return () => {
			if (document.title === next) {
				document.title = previous || BASE_TITLE;
			}
		};
	}, [title]);
}
