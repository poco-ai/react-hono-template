import type { Paginated } from "@workspace/shared";
import type { projectUpdates } from "../db/schema";

type ProjectUpdateRow = typeof projectUpdates.$inferSelect;

export type ProjectUpdateAuthorDto = {
	id: string;
	name: string;
	email: string;
	image: string | null;
};

export type ProjectUpdateDto = Omit<
	ProjectUpdateRow,
	"createdAt" | "updatedAt"
> & {
	createdAt: string;
	updatedAt: string;
	/** Null once the author account is deleted. */
	author: ProjectUpdateAuthorDto | null;
};

export type ListProjectUpdatesDto = Paginated<ProjectUpdateDto>;
