import type { Database } from "bun:sqlite";

/**
 * Minimal row builders for the real (migrated) schema.
 *
 * Fixtures only fill the NOT NULL columns a test does not care about; callers
 * override any column they assert on. Foreign keys are off in the test
 * database, so parent rows are seeded for realism rather than to satisfy
 * constraints, while NOT NULL / UNIQUE constraints stay enforced.
 */

export const seedUser = (
	sqlite: Database,
	input: {
		id: string;
		name?: string;
		email?: string;
		image?: string | null;
		role?: string;
	},
) =>
	sqlite.run(
		"INSERT INTO user (id, name, email, image, role) VALUES (?, ?, ?, ?, ?)",
		input.id,
		input.name ?? `User ${input.id}`,
		input.email ?? `${input.id}@example.com`,
		input.image ?? null,
		input.role ?? "user",
	);

export const seedOrganization = (
	sqlite: Database,
	input: { id: string; name?: string; slug?: string; frozen?: boolean },
) =>
	sqlite.run(
		"INSERT INTO organization (id, name, slug, frozen) VALUES (?, ?, ?, ?)",
		input.id,
		input.name ?? `Org ${input.id}`,
		input.slug ?? input.id,
		input.frozen ? 1 : 0,
	);

export const seedMember = (
	sqlite: Database,
	input: {
		orgId: string;
		userId: string;
		id?: string;
		role?: "owner" | "admin" | "member";
	},
) =>
	sqlite.run(
		"INSERT INTO member (id, organization_id, user_id, role) VALUES (?, ?, ?, ?)",
		input.id ?? `member-${input.orgId}-${input.userId}`,
		input.orgId,
		input.userId,
		input.role ?? "member",
	);

export const seedProject = (
	sqlite: Database,
	input: {
		id: string;
		orgId: string;
		name?: string;
		key?: string;
		description?: string | null;
		color?: string | null;
		archived?: boolean;
		nextNumber?: number;
		health?: string | null;
		targetDate?: number | null;
		leadId?: string | null;
	},
) =>
	sqlite.run(
		`INSERT INTO projects
			(id, org_id, name, key, description, color, archived, next_number, health, target_date, lead_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		input.id,
		input.orgId,
		input.name ?? `Project ${input.id}`,
		input.key ?? input.id.toUpperCase(),
		input.description ?? null,
		input.color ?? null,
		input.archived ? 1 : 0,
		input.nextNumber ?? 1,
		input.health ?? null,
		input.targetDate ?? null,
		input.leadId ?? null,
	);

export const seedStatus = (
	sqlite: Database,
	input: {
		id: string;
		orgId: string;
		name?: string;
		category?: string;
		color?: string;
		position?: number;
		isDefault?: boolean;
	},
) =>
	sqlite.run(
		`INSERT INTO issue_statuses
			(id, org_id, name, category, color, position, is_default)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		input.id,
		input.orgId,
		input.name ?? input.id,
		input.category ?? "unstarted",
		input.color ?? "#94a3b8",
		input.position ?? 0,
		input.isDefault ? 1 : 0,
	);

export const seedCycle = (
	sqlite: Database,
	input: {
		id: string;
		orgId: string;
		projectId: string;
		number: number;
		startsAt: number;
		endsAt: number;
		name?: string;
		createdById?: string | null;
	},
) =>
	sqlite.run(
		`INSERT INTO cycles
			(id, org_id, project_id, name, number, starts_at, ends_at, created_by_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		input.id,
		input.orgId,
		input.projectId,
		input.name ?? `Cycle ${input.number}`,
		input.number,
		input.startsAt,
		input.endsAt,
		input.createdById ?? null,
	);

const nextIssueNumber = (sqlite: Database, projectId: string) =>
	(
		sqlite
			.query(
				"SELECT COALESCE(MAX(number), 0) + 1 AS next FROM issues WHERE project_id = ?",
			)
			.get(projectId) as { next: number }
	).next;

export const seedIssue = (
	sqlite: Database,
	input: {
		id: string;
		orgId: string;
		projectId: string;
		number?: number;
		title?: string;
		description?: string | null;
		parentId?: string | null;
		cycleId?: string | null;
		statusId?: string;
		priority?: number;
		assigneeId?: string | null;
		createdById?: string | null;
		dueDate?: number | null;
		estimate?: number | null;
		deletedAt?: number | null;
		archivedAt?: number | null;
		createdAt?: number;
		updatedAt?: number;
	},
) =>
	sqlite.run(
		`INSERT INTO issues
			(id, org_id, project_id, number, title, description, parent_id, cycle_id, status_id,
			 priority, assignee_id, created_by_id, due_date, estimate, deleted_at, archived_at,
			 created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, cast(unixepoch('subsecond') * 1000 as integer)), COALESCE(?, cast(unixepoch('subsecond') * 1000 as integer)))`,
		input.id,
		input.orgId,
		input.projectId,
		input.number ?? nextIssueNumber(sqlite, input.projectId),
		input.title ?? `Issue ${input.id}`,
		input.description ?? null,
		input.parentId ?? null,
		input.cycleId ?? null,
		input.statusId ?? "status-default",
		input.priority ?? 0,
		input.assigneeId ?? null,
		input.createdById ?? null,
		input.dueDate ?? null,
		input.estimate ?? null,
		input.deletedAt ?? null,
		input.archivedAt ?? null,
		input.createdAt ?? null,
		input.updatedAt ?? null,
	);
