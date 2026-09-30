import type { ProjectDto } from "@api/dto/project.dto";
import { updateProjectSchema } from "@workspace/shared";
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
import { Textarea } from "@workspace/ui/components/textarea";
import { CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useUpdateProject } from "@/features/projects/data";

import { apiErrorMessage } from "@/lib/errors";
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
			<DialogContent className="sm:max-w-md">
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
					<div className="flex flex-col gap-2">
						<Label htmlFor="edit-project-name">{t("projects.name")}</Label>
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
						{fieldErrors.name && (
							<p
								id="edit-project-name-error"
								className="text-destructive text-sm"
							>
								{fieldErrors.name}
							</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="edit-project-key">{t("projects.key")}</Label>
						<Input
							id="edit-project-key"
							value={project?.key ?? ""}
							disabled
							className="w-full font-mono uppercase"
						/>
						<p className="text-muted-foreground text-xs">
							{t("projects.keyLockedHint")}
						</p>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="edit-project-description">
							{t("common.description")}
							<span className="text-muted-foreground">
								{" "}
								({t("common.optional")})
							</span>
						</Label>
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
						{fieldErrors.description && (
							<p
								id="edit-project-description-error"
								className="text-destructive text-sm"
							>
								{fieldErrors.description}
							</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="edit-project-color">
							{t("projects.color")}
							<span className="text-muted-foreground">
								{" "}
								({t("common.optional")})
							</span>
						</Label>
						<Input
							id="edit-project-color"
							type="color"
							value={color}
							onChange={(e) => setColor(e.target.value)}
							className="h-8 w-full p-1"
						/>
					</div>
					{updateMutation.isError && (
						<Alert variant="destructive">
							<CircleAlert />
							<AlertDescription>
								{apiErrorMessage(t, updateMutation.error)}
							</AlertDescription>
						</Alert>
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
