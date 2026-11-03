import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAiChat } from "@/features/ai/chat-provider";
import { aiToolEffect, aiToolTitleKey } from "@/features/ai/data";

function stringifyInput(input: unknown): string {
	if (input === undefined) {
		return "";
	}
	try {
		const json = JSON.stringify(input, null, 2);
		return json.length > 4000 ? `${json.slice(0, 4000)}…` : json;
	} catch {
		return "";
	}
}

/**
 * Write-preview card for tool calls that need explicit user approval. Nothing
 * is executed here: the decision goes back through the chat runtime and the
 * API re-verifies it server-side.
 */
export function ApprovalCard({
	approvalId,
	toolName,
	input,
}: {
	approvalId: string;
	toolName: string;
	input: unknown;
}) {
	const { t } = useTranslation();
	const { addToolApprovalResponse } = useAiChat();
	const titleKey = aiToolTitleKey(toolName);
	const title = titleKey ? t(titleKey) : toolName;
	const destructive = aiToolEffect(toolName) === "destructive";
	const inputJson = stringifyInput(input);

	return (
		<Alert variant={destructive ? "destructive" : "default"}>
			{destructive ? <ShieldAlert /> : <ShieldCheck />}
			<AlertTitle>
				{destructive
					? t("ai.approval.destructiveTitle")
					: t("ai.approval.title")}
			</AlertTitle>
			<AlertDescription>
				<p>{t("ai.approval.description", { tool: title })}</p>
				{destructive ? <p>{t("ai.approval.destructiveDescription")}</p> : null}
				{inputJson ? (
					<div className="mt-2 flex flex-col gap-1">
						<span className="text-foreground/80 text-xs font-medium">
							{t("ai.approval.inputLabel")}
						</span>
						<pre className="bg-muted/60 max-h-56 overflow-auto rounded-md p-2 font-mono text-xs text-foreground">
							{inputJson}
						</pre>
					</div>
				) : null}
				<div className="mt-3 flex flex-wrap gap-2">
					<Button
						size="sm"
						variant={destructive ? "destructive" : "default"}
						onClick={() =>
							addToolApprovalResponse({ id: approvalId, approved: true })
						}
					>
						{t("ai.approval.approve")}
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() =>
							addToolApprovalResponse({ id: approvalId, approved: false })
						}
					>
						{t("ai.approval.reject")}
					</Button>
				</div>
			</AlertDescription>
		</Alert>
	);
}
