import type { labels } from "../db/schema";

type LabelRow = typeof labels.$inferSelect;

export type LabelDto = Omit<LabelRow, "createdAt" | "updatedAt"> & {
	createdAt: string;
	updatedAt: string;
};

export type ListLabelsDto = {
	items: LabelDto[];
};
