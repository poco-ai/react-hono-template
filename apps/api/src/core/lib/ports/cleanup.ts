/**
 * Port: periodic cleanup contribution owned by a feature.
 *
 * The registry lives in core so `cleanup.service` keeps compiling when any
 * contributing feature (webhooks, ai, notifications, attachments) is trimmed
 * from a preset — the feature registers its handler at assembly time and the
 * returned counts merge into the cron log with their original key names.
 */
export type CleanupHandler = (now: Date) => Promise<Record<string, number>>;
