/**
 * Leaf module for the active sidebar-item class. Kept out of
 * `org-sidebar-link.tsx` so feature components (conversation rows, project
 * extras) can import it without pulling the nav module and its registry
 * import chain into an initialization cycle.
 */
export const ACTIVE_ITEM_CLASS =
	"bg-sidebar-accent text-sidebar-accent-foreground font-medium";
