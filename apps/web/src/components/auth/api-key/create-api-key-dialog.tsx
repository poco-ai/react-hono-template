// Adapted from Better Auth UI base-nova registry. The existing API supports named,
// non-expiring organization keys, so provider configurations and expiry are omitted.
import { createApiKeySchema } from "@workspace/shared";
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
import { useCreateApiKey } from "@/features/api-keys/data";
import { apiErrorMessage } from "@/lib/errors";
import { fieldErrorsFromZod } from "@/lib/form";
import { NewApiKeyDialog } from "./new-api-key-dialog";

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
	const [name, setName] = useState("");
	const [access, setAccess] = useState<"read" | "write">("write");
	const [error, setError] = useState<string>();
	const [created, setCreated] = useState<{ name: string; key: string } | null>(
		null,
	);
	const mutation = useCreateApiKey(organizationId);
	const close = (next: boolean) => {
		if (mutation.isPending) return;
		if (!next) {
			setName("");
			setAccess("write");
			setError(undefined);
			mutation.reset();
		}
		onOpenChange(next);
	};
	return (
		<>
			<Dialog open={open} onOpenChange={close}>
				<DialogContent>
					<form
						className="flex flex-col gap-6"
						onSubmit={async (event) => {
							event.preventDefault();
							if (locked || mutation.isPending) return;
							const parsed = createApiKeySchema.safeParse({
								name: name.trim(),
								scopes: access === "read" ? ["read"] : ["read", "write"],
							});
							if (!parsed.success) {
								setError(fieldErrorsFromZod(parsed.error, t).name);
								return;
							}
							try {
								const key = await mutation.mutateAsync(parsed.data);
								setCreated({ name: key.name, key: key.key });
								setName("");
								setError(undefined);
								onOpenChange(false);
							} catch {
								/* Mutation error is rendered below. */
							}
						}}
					>
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2">
								<Key />
								{t("apiKeys.createTitle")}
							</DialogTitle>
							<DialogDescription>
								{t("apiKeys.createDescription")}
							</DialogDescription>
						</DialogHeader>
						<Field>
							<FieldLabel htmlFor="api-key-name">
								{t("apiKeys.name")}
							</FieldLabel>
							<Input
								id="api-key-name"
								value={name}
								onChange={(event) => {
									setName(event.target.value);
									setError(undefined);
								}}
								maxLength={50}
								autoFocus
								disabled={locked || mutation.isPending}
								placeholder={t("apiKeys.namePlaceholder")}
								aria-invalid={!!error}
								aria-describedby={error ? "api-key-name-error" : undefined}
							/>
							{error && (
								<p id="api-key-name-error" className="text-destructive text-sm">
									{error}
								</p>
							)}
						</Field>
						<Field>
							<FieldLabel htmlFor="api-key-access">
								{t("apiKeys.access")}
							</FieldLabel>
							<Select
								value={access}
								disabled={locked || mutation.isPending}
								onValueChange={(value) =>
									setAccess(value === "read" ? "read" : "write")
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
								{access === "read"
									? t("apiKeys.accessReadDescription")
									: t("apiKeys.accessWriteDescription")}
							</FieldDescription>
						</Field>
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
