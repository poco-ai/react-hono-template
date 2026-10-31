// Adapted from Better Auth UI base-nova registry; revocation retains our audit history.
import type { ApiKeyDto } from "@api/dto/api-key.dto";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Spinner } from "@workspace/ui/components/spinner";
import { Key } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useRevokeApiKey } from "@/features/api-keys/data";
import { apiErrorMessage } from "@/lib/errors";

export function DeleteApiKeyDialog({
	open,
	onOpenChange,
	apiKey,
	organizationId,
	locked,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	apiKey: ApiKeyDto;
	organizationId: string;
	locked: boolean;
}) {
	const { t } = useTranslation();
	const mutation = useRevokeApiKey(organizationId, {
		onSuccess: () => {
			toast.success(t("toast.apiKeyRevoked"));
			onOpenChange(false);
		},
	});
	const previewId = `delete-api-key-preview-${apiKey.id}`;
	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				if (!mutation.isPending) onOpenChange(next);
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogMedia>
						<Key />
					</AlertDialogMedia>
					<AlertDialogTitle>{t("apiKeys.revokeTitle")}</AlertDialogTitle>
					<AlertDialogDescription>
						{t("apiKeys.revokeDescription", { name: apiKey.name })}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Field>
					<FieldLabel htmlFor={previewId}>{apiKey.name}</FieldLabel>
					<Input
						id={previewId}
						value={`${apiKey.prefix}${"*".repeat(16)}`}
						readOnly
						className="font-mono text-xs"
						disabled
					/>
				</Field>
				{mutation.error && (
					<p role="alert" className="text-destructive text-sm">
						{apiErrorMessage(t, mutation.error)}
					</p>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={mutation.isPending}>
						{t("common.cancel")}
					</AlertDialogCancel>
					<Button
						type="button"
						variant="destructive"
						disabled={locked || mutation.isPending}
						onClick={() => {
							if (!locked) mutation.mutate(apiKey.id);
						}}
					>
						{mutation.isPending && <Spinner />}
						{t("apiKeys.revoke")}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
