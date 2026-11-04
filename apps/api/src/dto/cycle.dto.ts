import type { CycleStatus, Paginated } from "@workspace/shared";
import type { cycles } from "../db/schema";

type CycleRow = typeof cycles.$inferSelect;

export type CycleDto = Omit<
	CycleRow,
	"startsAt" | "endsAt" | "createdAt" | "updatedAt"
> & {
	startsAt: string;
	endsAt: string;
	createdAt: string;
	updatedAt: string;
};

export type CycleProgressDto = {
	/** Non-deleted issues assigned to the cycle. */
	total: number;
	/** Issues in a terminal status category (completed or canceled). */
	terminal: number;
	/** `terminal / total` rounded to a whole percent (0 when empty). */
	percent: number;
};

export type CycleWithProgressDto = CycleDto & {
	/** Derived from the dates at read time (never stored). */
	status: CycleStatus;
	progress: CycleProgressDto;
};

export type ListCyclesDto = Paginated<CycleWithProgressDto>;

/** Result of moving the non-terminal issues of one cycle to another. */
export type CycleRolloverDto = {
	sourceCycleId: string;
	targetCycleId: string;
	moved: number;
};
