export const PENDING_UPLOAD_TTL_MS = 60 * 60 * 1000;
/** Replaced avatars and logos stay readable for a day before object deletion. */
export const SUPERSEDED_MEDIA_TTL_MS = 24 * 60 * 60 * 1000;
export const PENDING_CLEANUP_LIMIT = 100;

export const UPLOAD_KINDS = [
	"issue_attachment",
	"comment_attachment",
	"avatar",
	"org_logo",
] as const;

export type UploadKind = (typeof UPLOAD_KINDS)[number];

/** Issue and comment uploads reserve org capacity. Avatars and logos do not. */
export const QUOTA_UPLOAD_KINDS = [
	"issue_attachment",
	"comment_attachment",
] as const satisfies readonly UploadKind[];

export const MEDIA_KINDS = ["avatar", "org_logo", "project_cover"] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

export const NON_QUOTA_MEDIA_KINDS = ["avatar", "org_logo"] as const;
