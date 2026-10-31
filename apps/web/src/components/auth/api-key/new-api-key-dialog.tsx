// Adapted from Better Auth UI base-nova registry: https://better-auth-ui.com/r/base-nova/api-key.json
"use client";

import { useCopyToClipboard } from "@better-auth-ui/react";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@workspace/ui/components/input-group";
import { Label } from "@workspace/ui/components/label";
import { Check, Copy, Key } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export type NewApiKeyDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	name: string | null;
	secretKey: string | null;
};

export function NewApiKeyDialog({
	open,
	onOpenChange,
	name,
	secretKey,
}: NewApiKeyDialogProps) {
	const { t } = useTranslation();

	const { copied, copy, reset } = useCopyToClipboard({
		onError: (error) => {
			console.error("[Better Auth UI] Copy failed", error);
			toast.error(t("common.copyFailed"));
		},
	});

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			reset();
		}

		onOpenChange(nextOpen);
	};

	const copySecretKey = async () => {
		if (!secretKey) return;

		await copy(secretKey);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Key />
						{t("apiKeys.createdTitle")}
					</DialogTitle>

					<DialogDescription>{t("apiKeys.secretWarning")}</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-2">
					<Label htmlFor="new-api-key-secret">{name || t("apiKeys.key")}</Label>

					<InputGroup>
						<InputGroupInput
							id="new-api-key-secret"
							value={secretKey ?? ""}
							readOnly
							className="font-mono text-xs"
						/>

						<InputGroupAddon align="inline-end">
							<InputGroupButton
								size="icon-xs"
								aria-label={copied ? t("common.copied") : t("common.copy")}
								onClick={copySecretKey}
							>
								{copied ? <Check /> : <Copy />}
							</InputGroupButton>
						</InputGroupAddon>
					</InputGroup>
				</div>

				<DialogFooter>
					<Button type="button" onClick={() => handleOpenChange(false)}>
						{t("common.done")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
