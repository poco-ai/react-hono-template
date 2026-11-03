import { useQuery } from "@tanstack/react-query";
import { createProjectSchema } from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import { ColorSwatchPicker } from "@workspace/ui/components/color-swatch-picker";
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
import { Textarea } from "@workspace/ui/components/textarea";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { QuotaError } from "@/components/quota-error";
import { useSession } from "@/features/auth/data";
import { MANAGE_ROLES, membersQuery } from "@/features/members/data";
import { useCreateProject } from "@/features/projects/data";
import { projectKeyFromName } from "@/features/projects/utils";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";

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

	const createMutation = useCreateProject(orgId, {
		onSuccess: () => {
			toast.success(t("toast.projectCreated"));

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
		createMutation.mutate(parsed.data);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md" closeLabel={t("common.close")}>
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
					<Field data-invalid={fieldErrors.name ? true : undefined}>
						<FieldLabel htmlFor="project-name">{t("projects.name")}</FieldLabel>
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
						<FieldError id="project-name-error">{fieldErrors.name}</FieldError>
					</Field>
					<Field data-invalid={fieldErrors.key ? true : undefined}>
						<FieldLabel htmlFor="project-key">{t("projects.key")}</FieldLabel>
						<Input
							id="project-key"
							value={key}
							placeholder={t("projects.keyPlaceholder")}
							onChange={(e) => onKeyChange(e.target.value)}
							className="w-full font-mono uppercase"
							aria-invalid={fieldErrors.key ? true : undefined}
							aria-describedby={
								fieldErrors.key
									? "project-key-error project-key-hint"
									: "project-key-hint"
							}
						/>
						<FieldDescription id="project-key-hint">
							{t("projects.keyHint")}
						</FieldDescription>
						<FieldError id="project-key-error">{fieldErrors.key}</FieldError>
					</Field>
					<Field data-invalid={fieldErrors.description ? true : undefined}>
						<FieldLabel htmlFor="project-description">
							{t("common.description")}
							<span className="text-muted-foreground">
								{" "}
								({t("common.optional")})
							</span>
						</FieldLabel>
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
						<FieldError id="project-description-error">
							{fieldErrors.description}
						</FieldError>
					</Field>
					<Field>
						<FieldLabel>
							{t("projects.color")}
							<span className="text-muted-foreground">
								{" "}
								({t("common.optional")})
							</span>
						</FieldLabel>
						<ColorSwatchPicker
							value={color}
							onChange={setColor}
							ariaLabel={t("projects.color")}
						/>
					</Field>
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
