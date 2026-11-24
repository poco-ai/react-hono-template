/**
 * Ports: storage usage accounting consumed by attachment workflows, plus the
 * attachment/media/pending-upload read shapes the accounting itself needs.
 *
 * The types live in core so `storage-usage.service` (billing) and
 * `attachment.service` (attachments) keep compiling when the *other* feature
 * is trimmed from a preset: billing without attachments can still compile
 * against these structural dao shapes, and attachments without billing
 * injects an unlimited implementation. All signatures are hand-written — do
 * not import feature dao modules from here.
 */

/** Upload kind that reserves org storage capacity. */
export type QuotaUploadKind = "issue_attachment" | "comment_attachment";

export type UploadQuotaTarget =
	| { kind: "issue_attachment"; issueId: string }
	| { kind: "comment_attachment"; commentId: string };

export type OrgStorageUsage = {
	attachments: number;
	pending: number;
	media: number;
	total: number;
};

/** Byte-accounting surface used by attachment.service. */
export type StorageUsage = {
	getOrgUsage: (orgId: string, now?: Date) => Promise<OrgStorageUsage>;
	assertCanUpload: (
		orgId: string,
		size: number,
		target: UploadQuotaTarget,
		now?: Date,
		hold?: { idempotencyKey: string; actorId?: string },
	) => Promise<void>;
	settleHold: (orgId: string, idempotencyKey: string) => Promise<void>;
	releaseHold: (orgId: string, idempotencyKey: string) => Promise<void>;
	refundGauge: (
		orgId: string,
		previousBytes: number,
		nextBytes: number,
		sourceId: string,
		actorId?: string,
	) => Promise<void>;
};

/** Attachment byte/count reads (AttachmentDao satisfies this structurally). */
export type AttachmentUsageDao = {
	sumSizeByOrg: (orgId: string) => Promise<number>;
	countByIssue: (orgId: string, issueId: string) => Promise<number>;
	countByComment: (orgId: string, commentId: string) => Promise<number>;
};

/** Pending-upload reservation reads (PendingUploadDao satisfies this). */
export type PendingUploadUsageDao = {
	sumDeclaredSizeByOrg: (orgId: string, now: Date) => Promise<number>;
	countByTarget: (
		orgId: string,
		kind: QuotaUploadKind,
		targetId: string,
		now: Date,
	) => Promise<number>;
};

/** Active media byte reads (MediaAssetDao satisfies this structurally). */
export type MediaAssetUsageDao = {
	sumActiveSizeByOrg: (orgId: string) => Promise<number>;
};
