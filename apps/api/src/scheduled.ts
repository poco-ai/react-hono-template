import type { ScheduledJob } from "./core/compose";
import type { BackgroundFn } from "./core/lib/background";

export const handleScheduled = async (
	jobs: readonly ScheduledJob[],
	background?: BackgroundFn,
	now: Date = new Date(),
) => {
	// Runs are independent: a broken job must not stop the other scheduled
	// work, so each gets its own try/catch and keeps its historical log
	// format (the cleanup key layout and recurrence counters).
	for (const job of jobs) {
		try {
			await job.run(now, background);
		} catch (err) {
			console.error(job.failureMessage, err);
		}
	}
};
