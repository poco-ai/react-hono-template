/**
 * Port: cycle validation and lookup surface consumed by issue workflows.
 *
 * The type lives in core so `issue.service` keeps compiling when the cycles
 * feature is trimmed from a preset — cycles are a planning add-on, and an
 * absent guard simply skips cycle assignment validation. The feature adapts
 * `cycle.service`/`cycle.dao` to this shape at assembly time.
 */

/** Minimal cycle view issue workflows need (CycleDto satisfies it). */
export type CycleRef = {
	id: string;
	projectId: string;
	name: string;
};

export type CycleGuard = {
	/**
	 * The cycle must exist in the organization (org-scoped lookup) and belong
	 * to the issue's project.
	 */
	assertCycleAssignable: (
		orgId: string,
		projectId: string,
		cycleId: string,
	) => Promise<unknown>;
	findById: (orgId: string, cycleId: string) => Promise<CycleRef | null>;
	listAllByProject: (orgId: string, projectId: string) => Promise<CycleRef[]>;
};
