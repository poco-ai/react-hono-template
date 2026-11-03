import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@workspace/ui/components/alert";
import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { aiErrorCode } from "@/features/ai/data";
import type { TranslationKey } from "@/lib/errors";

const AI_ERROR_MESSAGE_KEYS: Record<string, TranslationKey> = {
	AI_DISABLED: "ai.errors.disabled",
	AI_NOT_CONFIGURED: "ai.errors.notConfigured",
	AI_QUOTA_EXCEEDED: "ai.errors.quota",
	AI_RATE_LIMITED: "ai.errors.rateLimited",
	AI_TOOL_FAILED: "ai.errors.toolFailed",
	AI_CONVERSATION_NOT_FOUND: "ai.errors.conversationNotFound",
	AI_MESSAGE_INVALID: "ai.errors.messageInvalid",
	AI_APPROVAL_NOT_FOUND: "ai.errors.approvalNotFound",
};

const AI_ERROR_DESCRIPTION_KEYS: Record<string, TranslationKey> = {
	AI_DISABLED: "ai.errors.disabledDescription",
	AI_NOT_CONFIGURED: "ai.errors.notConfiguredDescription",
	AI_QUOTA_EXCEEDED: "ai.errors.quotaDescription",
};

/** Destructive alert with AI-specific copy for known API error codes. */
export function AiErrorAlert({
	error,
	className,
}: {
	error: Error | null | undefined;
	className?: string;
}) {
	const { t } = useTranslation();

	if (!error) {
		return null;
	}

	const code = aiErrorCode(error);
	const messageKey = code ? AI_ERROR_MESSAGE_KEYS[code] : undefined;
	const descriptionKey = code ? AI_ERROR_DESCRIPTION_KEYS[code] : undefined;

	return (
		<Alert variant="destructive" className={className}>
			<CircleAlert />
			<AlertTitle>{t("ai.errors.title")}</AlertTitle>
			<AlertDescription>
				<p>{messageKey ? t(messageKey) : t("ai.errors.generic")}</p>
				{descriptionKey ? <p>{t(descriptionKey)}</p> : null}
			</AlertDescription>
		</Alert>
	);
}
