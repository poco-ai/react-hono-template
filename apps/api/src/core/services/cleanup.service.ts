import type { MemberDao } from "../dao/member.dao";
import type { CleanupHandler } from "../lib/ports/cleanup";

/**
 * Core cleanup: expired invitations plus whatever handlers the assembled
 * features register (webhook delivery sweeping, AI conversation retention,
 * notification retention, storage object reclamation). Handlers own their
 * feature's dao/storage access — core only sequences them and merges their
 * counts, so every contributing feature stays removable.
 */
export const createCleanupService = ({
	memberDao,
	handlers = [],
}: {
	memberDao: Pick<MemberDao, "deleteExpiredPending">;
	/** Feature cleanup contributions; counts merge into the cron log. */
	handlers?: CleanupHandler[];
}) => {
	return {
		cleanup: async (now = new Date()) => {
			const expiredInvitations = await memberDao.deleteExpiredPending(now);
			const counts: Record<string, number> = { expiredInvitations };
			for (const handler of handlers) {
				Object.assign(counts, await handler(now));
			}
			return counts;
		},
	};
};

export type CleanupService = ReturnType<typeof createCleanupService>;
