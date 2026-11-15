// Adapted from Better Auth UI base-nova registry. The existing API supports named,
// non-expiring organization keys, so provider configurations and expiry are omitted.
import { type CreateApiKeyInput, createApiKeySchema } from "@workspace/shared";
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
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Spinner } from "@workspace/ui/components/spinner";
import { Key } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useCreateApiKey } from "@/features/api-keys/data";
import { apiErrorMessage } from "@/lib/errors";
import { useZodForm } from "@/lib/use-zod-form";
import { NewApiKeyDialog } from "./new-api-key-dialog";

type ApiKeyFormValues = { name: string; access: "read" | "write" };

const apiKeyFormSchema = z.preprocess((values) => {
	// Guard non-object input so the wrapper cannot throw a TypeError before zod
	// gets a chance to report validation issues.
	if (!values || typeof values !== "object") {
		return values;
	}
	const input = values as ApiKeyFormValues;
	return {
		name: input.name.trim(),
		scopes: input.access === "read" ? ["read"] : ["read", "write"],
	};
}, createApiKeySchema);

const INPUT_IDS = { name: "api-key-name" };

export function CreateApiKeyDialog({
	open,
	onOpenChange,
	organizationId,
	locked,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	locked: boolean;
}) {
	const { t } = useTranslation();
	const [created, setCreated] = useState<{ name: string; key: string } | null>(
		null,
	);
	const mutation = useCreateApiKey(organizationId);

	const { form, fieldErrors, handleSubmit, reset } = useZodForm<
		ApiKeyFormValues,
		CreateApiKeyInput
	>({
		defaultValues: { name: "", access: "write" },
		schema: apiKeyFormSchema,
		onSubmit: async (values) => {
			if (locked || mutation.isPending) return;
			try {
				const key = await mutation.mutateAsync(values);
				setCreated({ name: key.name, key: key.key });
				reset({ name: "", access: "write" });
				onOpenChange(false);
			} catch {
				/* Mutation error is rendered below. */
			}
		},
		t,
		inputIds: INPUT_IDS,
	});

	const close = (next: boolean) => {
		if (mutation.isPending) return;
		if (!next) {
			reset({ name: "", access: "write" });
			mutation.reset();
		}
		onOpenChange(next);
	};
	return (
		<>
			<Dialog open={open} onOpenChange={close}>
				<DialogContent>
					<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2">
								<Key />
								{t("apiKeys.createTitle")}
							</DialogTitle>
							<DialogDescription>
								{t("apiKeys.createDescription")}
							</DialogDescription>
						</DialogHeader>
						<form.Field name="name">
							{(field) => (
								<Field data-invalid={fieldErrors.name ? true : undefined}>
									<FieldLabel htmlFor="api-key-name">
										{t("apiKeys.name")}
									</FieldLabel>
									<Input
										id="api-key-name"
										value={field.state.value}
										onChange={(event) => field.handleChange(event.target.value)}
										maxLength={50}
										autoFocus
										disabled={locked || mutation.isPending}
										placeholder={t("apiKeys.namePlaceholder")}
										aria-invalid={fieldErrors.name ? true : undefined}
										aria-describedby={
											fieldErrors.name ? "api-key-name-error" : undefined
										}
									/>
									<FieldError id="api-key-name-error">
										{fieldErrors.name}
									</FieldError>
								</Field>
							)}
						</form.Field>
						<form.Field name="access">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="api-key-access">
										{t("apiKeys.access")}
									</FieldLabel>
									<Select
										value={field.state.value}
										disabled={locked || mutation.isPending}
										onValueChange={(value) =>
											field.handleChange(value === "read" ? "read" : "write")
										}
									>
										<SelectTrigger id="api-key-access">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="read">
												{t("apiKeys.accessRead")}
											</SelectItem>
											<SelectItem value="write">
												{t("apiKeys.accessWrite")}
											</SelectItem>
										</SelectContent>
									</Select>
									<FieldDescription>
										{field.state.value === "read"
											? t("apiKeys.accessReadDescription")
											: t("apiKeys.accessWriteDescription")}
									</FieldDescription>
								</Field>
							)}
						</form.Field>
						{mutation.error && (
							<p role="alert" className="text-destructive text-sm">
								{apiErrorMessage(t, mutation.error)}
							</p>
						)}
						<DialogFooter>
							<Button
								variant="outline"
								type="button"
								disabled={mutation.isPending}
								onClick={() => close(false)}
							>
								{t("common.cancel")}
							</Button>
							<Button type="submit" disabled={locked || mutation.isPending}>
								{mutation.isPending && <Spinner />}
								{t("common.create")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
			<NewApiKeyDialog
				open={created !== null}
				onOpenChange={(next) => {
					if (!next) {
						setCreated(null);
						mutation.reset();
					}
				}}
				name={created?.name ?? null}
				secretKey={created?.key ?? null}
			/>
		</>
	);
}
