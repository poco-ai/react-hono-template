import { createApiKeySchema } from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SecretReveal } from "@/components/secret-reveal";
import { useCreateApiKey } from "@/features/api-keys/data";

import { apiErrorMessage } from "@/lib/errors";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";

export function CreateApiKeyDialog({
	orgId,
	open,
	onOpenChange,
}: {
	orgId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();
	const [name, setName] = useState("");
	const [createdKey, setCreatedKey] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	useEffect(() => {
		if (open) {
			setName("");
			setCreatedKey(null);
			setFieldErrors({});
		}
	}, [open]);

	const createMutation = useCreateApiKey(orgId, {
		onSuccess: (apiKey) => {
			setCreatedKey(apiKey.key);
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{createdKey ? t("apiKeys.createdTitle") : t("apiKeys.createTitle")}
					</DialogTitle>
					<DialogDescription>
						{createdKey
							? t("apiKeys.secretWarning")
							: t("apiKeys.createDescription")}
					</DialogDescription>
				</DialogHeader>
				{createdKey ? (
					<div className="flex flex-col gap-3">
						<SecretReveal value={createdKey} />
						<DialogFooter>
							<Button type="button" onClick={() => onOpenChange(false)}>
								{t("common.done")}
							</Button>
						</DialogFooter>
					</div>
				) : (
					<form
						noValidate
						className="flex flex-col gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							const parsed = createApiKeySchema.safeParse({
								name: name.trim(),
							});
							if (!parsed.success) {
								const errors = fieldErrorsFromZod(parsed.error, t);
								setFieldErrors(errors);
								focusFirstInvalidField(errors, { name: "api-key-name" });
								return;
							}
							createMutation.mutate(parsed.data);
						}}
					>
						<div className="flex flex-col gap-2">
							<Label htmlFor="api-key-name">{t("apiKeys.name")}</Label>
							<Input
								id="api-key-name"
								value={name}
								placeholder={t("apiKeys.namePlaceholder")}
								onChange={(e) => {
									setName(e.target.value);
									setFieldErrors((prev) => withoutFieldError(prev, "name"));
								}}
								maxLength={50}
								aria-invalid={fieldErrors.name ? true : undefined}
								aria-describedby={
									fieldErrors.name ? "api-key-name-error" : undefined
								}
							/>
							{fieldErrors.name && (
								<p id="api-key-name-error" className="text-destructive text-sm">
									{fieldErrors.name}
								</p>
							)}
						</div>
						{createMutation.isError && (
							<Alert variant="destructive">
								<CircleAlert />
								<AlertDescription>
									{apiErrorMessage(t, createMutation.error)}
								</AlertDescription>
							</Alert>
						)}
						<DialogFooter>
							<Button type="submit" disabled={createMutation.isPending}>
								{t("common.create")}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
