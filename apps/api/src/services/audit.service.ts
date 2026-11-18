import {
	type AuditAction,
	type AuditActorType,
	type AuditResult,
	redactAuditValue,
	serializeCsvText,
} from "@workspace/shared";
import type {
	AuditDao,
	AuditEventInsert,
	AuditEventRow,
} from "../dao/audit.dao";
import { currentRequestMeta } from "../lib/request-context";

export type AuditWrite = {
	orgId: string | null;
	actorType: AuditActorType;
	actorId?: string | null;
	action: AuditAction;
	targetType?: string | null;
	targetId?: string | null;
	result?: AuditResult;
	before?: Record<string, unknown> | null;
	after?: Record<string, unknown> | null;
};

const clip = (value: string | null | undefined, max: number): string | null => {
	if (!value) return null;
	return value.length > max ? value.slice(0, max) : value;
};

const payload = (
	value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null => {
	if (!value) return null;
	const redacted = redactAuditValue(value);
	return redacted && typeof redacted === "object"
		? (redacted as Record<string, unknown>)
		: null;
};

export const prepareAuditEvent = (input: AuditWrite): AuditEventInsert => {
	const meta = currentRequestMeta();
	return {
		id: crypto.randomUUID(),
		orgId: input.orgId,
		actorType: input.actorType,
		actorId: input.actorId ?? null,
		action: input.action,
		targetType: input.targetType ?? null,
		targetId: input.targetId ?? null,
		result: input.result ?? "success",
		requestId: clip(meta?.requestId, 128),
		ipAddress: clip(meta?.ipAddress, 64),
		userAgent: clip(meta?.userAgent, 512),
		before: payload(input.before),
		after: payload(input.after),
	};
};

const AUDIT_CSV_HEADERS = [
	"created_at",
	"org_id",
	"actor_type",
	"actor_id",
	"action",
	"target_type",
	"target_id",
	"result",
	"request_id",
	"ip_address",
	"before",
	"after",
] as const;

export const auditEventsToCsv = (rows: AuditEventRow[]): string =>
	serializeCsvText([
		AUDIT_CSV_HEADERS,
		...rows.map((row) => [
			row.createdAt.toISOString(),
			row.orgId ?? "",
			row.actorType,
			row.actorId ?? "",
			row.action,
			row.targetType ?? "",
			row.targetId ?? "",
			row.result,
			row.requestId ?? "",
			row.ipAddress ?? "",
			row.before ? JSON.stringify(row.before) : "",
			row.after ? JSON.stringify(row.after) : "",
		]),
	]);

export const createAuditService = (dao: AuditDao) => ({
	prepare: prepareAuditEvent,

	record: async (input: AuditWrite): Promise<void> => {
		await dao.insert(prepareAuditEvent(input));
	},

	list: (
		filter: Parameters<AuditDao["list"]>[0],
	): ReturnType<AuditDao["list"]> => dao.list(filter),

	exportCsv: async (
		filter: Omit<Parameters<AuditDao["list"]>[0], "page" | "pageSize">,
	): Promise<string> => {
		const page = await dao.list({ ...filter, page: 1, pageSize: 5000 });
		return auditEventsToCsv(page.items);
	},
});

export type AuditService = ReturnType<typeof createAuditService>;
