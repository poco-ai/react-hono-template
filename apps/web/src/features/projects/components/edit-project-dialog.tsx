import type { ProjectDto } from "@api/dto/project.dto";
import { updateProjectSchema } from "@workspace/shared";
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
import { MutationError } from "@/components/mutation-error";
import { useUpdateProject } from "@/features/projects/data";

import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";

const DEFAULT_COLOR = "#6366f1";

const INPUT_IDS = {
	name: "edit-project-name",
	description: "edit-project-description",
};

export function EditProjectDialog({
	orgId,
	project,
	open,
	onOpenChange,
}: {
	orgId: string;
	project: ProjectDto | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [color, setColor] = useState(DEFAULT_COLOR);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	const updateMutation = useUpdateProject(orgId, {
		onSuccess: () => {
			toast.success(t("toast.projectUpdated"));

			onOpenChange(false);
		},
	});

	useEffect(() => {
		if (open && project) {
			updateMutation.reset();
			setName(project.name);
			setDescription(project.description ?? "");
			setColor(project.color ?? DEFAULT_COLOR);
			setFieldErrors({});
		}
	}, [open, project, updateMutation.reset]);

	const onSubmit = () => {
		if (!project) {
			return;
		}
		const parsed = updateProjectSchema.safeParse({
			name: name.trim(),
			description: description.trim() || null,
			color,
		});
		if (!parsed.success) {
			const errors = fieldErrorsFromZod(parsed.error, t);
			setFieldErrors(errors);
			focusFirstInvalidField(errors, INPUT_IDS);
			return;
		}
		updateMutation.mutate({ projectId: project.id, input: parsed.data });
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md" closeLabel={t("common.close")}>
				<DialogHeader>
					<DialogTitle>{t("projects.editTitle")}</DialogTitle>
					<DialogDescription>{t("projects.editDescription")}</DialogDescription>
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
						<FieldLabel htmlFor="edit-project-name">
							{t("projects.name")}
						</FieldLabel>
						<Input
							id="edit-project-name"
							value={name}
							placeholder={t("projects.namePlaceholder")}
							onChange={(e) => {
								setName(e.target.value);
								setFieldErrors((prev) => withoutFieldError(prev, "name"));
							}}
							aria-invalid={fieldErrors.name ? true : undefined}
							aria-describedby={
								fieldErrors.name ? "edit-project-name-error" : undefined
							}
						/>
						<FieldError id="edit-project-name-error">
							{fieldErrors.name}
						</FieldError>
					</Field>
					<Field>
						<FieldLabel htmlFor="edit-project-key">
							{t("projects.key")}
						</FieldLabel>
						<Input
							id="edit-project-key"
							value={project?.key ?? ""}
							disabled
							className="w-full font-mono uppercase"
						/>
						<FieldDescription>{t("projects.keyLockedHint")}</FieldDescription>
					</Field>
					<Field data-invalid={fieldErrors.description ? true : undefined}>
						<FieldLabel htmlFor="edit-project-description">
							{t("common.description")}
							<span className="text-muted-foreground">
								{" "}
								({t("common.optional")})
							</span>
						</FieldLabel>
						<Textarea
							id="edit-project-description"
							value={description}
							placeholder={t("projects.descriptionPlaceholder")}
							onChange={(e) => {
								setDescription(e.target.value);
								setFieldErrors((prev) =>
									withoutFieldError(prev, "description"),
								);
							}}
							aria-invalid={fieldErrors.description ? true : undefined}
							aria-describedby={
								fieldErrors.description
									? "edit-project-description-error"
									: undefined
							}
						/>
						<FieldError id="edit-project-description-error">
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
					{updateMutation.isError && (
						<MutationError error={updateMutation.error} />
					)}
					<DialogFooter>
						<Button type="submit" disabled={updateMutation.isPending}>
							{t("common.save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
