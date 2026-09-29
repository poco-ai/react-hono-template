import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProjectSchema } from "@workspace/shared";
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
import { Textarea } from "@workspace/ui/components/textarea";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { QuotaError } from "@/components/quota-error";
import { client, unwrap } from "@/lib/api";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";
import { projectKeyFromName } from "@/lib/issue-utils";
import { MANAGE_ROLES, membersQuery } from "@/lib/queries/members";
import { useSession } from "@/lib/session";

const DEFAULT_COLOR = "#6366f1";

const INPUT_IDS = {
	name: "project-name",
	key: "project-key",
	description: "project-description",
};

export function CreateProjectDialog({
	orgId,
	open,
	onOpenChange,
}: {
	orgId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const members = useQuery(membersQuery(orgId));
	const [name, setName] = useState("");
	const [key, setKey] = useState("");
	const [keyTouched, setKeyTouched] = useState(false);
	const [description, setDescription] = useState("");
	const [color, setColor] = useState(DEFAULT_COLOR);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	useEffect(() => {
		if (open) {
			setName("");
			setKey("");
			setKeyTouched(false);
			setDescription("");
			setColor(DEFAULT_COLOR);
			setFieldErrors({});
		}
	}, [open]);

	const createMutation = useMutation({
		mutationFn: () =>
			unwrap(
				client.api.orgs[":orgId"].projects.$post({
					param: { orgId },
					json: {
						name: name.trim(),
						key,
						description: description.trim() || undefined,
						color,
					},
				}),
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "projects"] });
			onOpenChange(false);
		},
	});

	const onNameChange = (next: string) => {
		setName(next);
		setFieldErrors((prev) => withoutFieldError(prev, "name"));
		if (!keyTouched) {
			setKey(projectKeyFromName(next));
		}
	};

	const onKeyChange = (next: string) => {
		setKeyTouched(true);
		setKey(
			next
				.toUpperCase()
				.replace(/[^A-Z]/g, "")
				.slice(0, 6),
		);
		setFieldErrors((prev) => withoutFieldError(prev, "key"));
	};

	const onDescriptionChange = (next: string) => {
		setDescription(next);
		setFieldErrors((prev) => withoutFieldError(prev, "description"));
	};

	const myRole = members.data?.find((m) => m.userId === session?.user.id)?.role;
	const canManage =
		myRole !== undefined && (MANAGE_ROLES as string[]).includes(myRole);

	const onSubmit = () => {
		const parsed = createProjectSchema.safeParse({
			name: name.trim(),
			key,
			description: description.trim() || undefined,
			color,
		});
		if (!parsed.success) {
			const errors = fieldErrorsFromZod(parsed.error, t, {
				key: "form.errors.identifierPattern",
			});
			setFieldErrors(errors);
			focusFirstInvalidField(errors, INPUT_IDS);
			return;
		}
		createMutation.mutate();
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("projects.createTitle")}</DialogTitle>
					<DialogDescription>
						{t("projects.createDescription")}
					</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						onSubmit();
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="project-name">{t("projects.name")}</Label>
						<Input
							id="project-name"
							value={name}
							placeholder={t("projects.namePlaceholder")}
							onChange={(e) => onNameChange(e.target.value)}
							aria-invalid={fieldErrors.name ? true : undefined}
							aria-describedby={
								fieldErrors.name ? "project-name-error" : undefined
							}
						/>
						{fieldErrors.name && (
							<p id="project-name-error" className="text-destructive text-sm">
								{fieldErrors.name}
							</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="project-key">{t("projects.key")}</Label>
						<Input
							id="project-key"
							value={key}
							placeholder={t("projects.keyPlaceholder")}
							onChange={(e) => onKeyChange(e.target.value)}
							className="w-28 font-mono uppercase"
							aria-invalid={fieldErrors.key ? true : undefined}
							aria-describedby={
								fieldErrors.key
									? "project-key-error project-key-hint"
									: "project-key-hint"
							}
						/>
						<p id="project-key-hint" className="text-muted-foreground text-xs">
							{t("projects.keyHint")}
						</p>
						{fieldErrors.key && (
							<p id="project-key-error" className="text-destructive text-sm">
								{fieldErrors.key}
							</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="project-description">
							{t("common.description")}
							<span className="text-muted-foreground">
								{" "}
								({t("common.optional")})
							</span>
						</Label>
						<Textarea
							id="project-description"
							value={description}
							placeholder={t("projects.descriptionPlaceholder")}
							onChange={(e) => onDescriptionChange(e.target.value)}
							aria-invalid={fieldErrors.description ? true : undefined}
							aria-describedby={
								fieldErrors.description
									? "project-description-error"
									: undefined
							}
						/>
						{fieldErrors.description && (
							<p
								id="project-description-error"
								className="text-destructive text-sm"
							>
								{fieldErrors.description}
							</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="project-color">
							{t("projects.color")}
							<span className="text-muted-foreground">
								{" "}
								({t("common.optional")})
							</span>
						</Label>
						<Input
							id="project-color"
							type="color"
							value={color}
							onChange={(e) => setColor(e.target.value)}
							className="h-9 w-16 p-1"
						/>
					</div>
					{createMutation.isError && (
						<QuotaError
							error={createMutation.error}
							orgId={orgId}
							canUpgrade={canManage}
						/>
					)}
					<DialogFooter>
						<Button type="submit" disabled={createMutation.isPending}>
							{t("common.create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
