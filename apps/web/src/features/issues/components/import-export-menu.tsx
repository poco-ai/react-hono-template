import type { IssueImportResultDto } from "@workspace/shared";
import {
	ISSUE_CSV_MAX_EXPORT_ROWS,
	ISSUE_CSV_MAX_IMPORT_ROWS,
} from "@workspace/shared";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@workspace/ui/components/alert";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
	Field,
	FieldDescription,
	FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Spinner } from "@workspace/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import { ChevronDown, Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiErrorMessage } from "@/lib/errors";
import {
	buildIssueCsvPreview,
	ISSUE_CSV_MAX_FILE_BYTES,
	type IssueCsvPreview,
	type IssueCsvRowError,
} from "../csv";
import { exportProjectIssues, useImportIssues } from "../data";

const CSV_ERROR_KEYS = {
	missingHeader: "issues.csv.errors.missingHeader",
	missingTitleColumn: "issues.csv.errors.missingTitleColumn",
	tooManyRows: "issues.csv.errors.tooManyRows",
	empty: "issues.csv.errors.empty",
	titleRequired: "issues.csv.errors.titleRequired",
	titleTooLong: "issues.csv.errors.titleTooLong",
	descriptionTooLong: "issues.csv.errors.descriptionTooLong",
	priorityInvalid: "issues.csv.errors.priorityInvalid",
	estimateInvalid: "issues.csv.errors.estimateInvalid",
	dueDateInvalid: "issues.csv.errors.dueDateInvalid",
} as const;

/**
 * Project header "Import / export" menu. Export downloads the CSV Blob;
 * import parses the file in the browser, previews the first rows, then sends
 * the mapped rows to the API (which re-validates against org data).
 */
export function ImportExportMenu({
	orgId,
	projectId,
	frozen,
}: {
	orgId: string;
	projectId: string;
	frozen: boolean;
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [fileName, setFileName] = useState("");
	const [preview, setPreview] = useState<IssueCsvPreview | null>(null);
	const [fileError, setFileError] = useState<"tooLarge" | "unreadable" | null>(
		null,
	);
	const [result, setResult] = useState<IssueImportResultDto | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const importMutation = useImportIssues(orgId, projectId);

	const resetImport = () => {
		setFileName("");
		setPreview(null);
		setFileError(null);
		setResult(null);
		if (fileInput.current) {
			fileInput.current.value = "";
		}
	};

	const onOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) {
			resetImport();
		}
	};

	const handleExport = async () => {
		try {
			const { blob, filename, truncated, total } = await exportProjectIssues(
				orgId,
				projectId,
			);
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = filename;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			// Revoke on the next task so the download has started.
			setTimeout(() => URL.revokeObjectURL(url), 0);
			toast.success(t("issues.csv.exportSuccess", { filename }));
			if (truncated) {
				toast.warning(
					t("issues.csv.exportTruncated", {
						total,
						count: ISSUE_CSV_MAX_EXPORT_ROWS,
					}),
				);
			}
		} catch (error) {
			toast.error(apiErrorMessage(t, error));
		}
	};

	const onFile = async (file: File | undefined) => {
		setResult(null);
		setPreview(null);
		setFileError(null);
		setFileName(file?.name ?? "");
		if (!file) {
			return;
		}
		if (file.size > ISSUE_CSV_MAX_FILE_BYTES) {
			setFileError("tooLarge");
			return;
		}
		try {
			setPreview(buildIssueCsvPreview(await file.text()));
		} catch {
			setFileError("unreadable");
		}
	};

	const confirm = () => {
		if (!preview || preview.fatal || preview.rows.length === 0) {
			return;
		}
		importMutation.mutate(
			{ rows: preview.rows },
			{
				onSuccess: (data) => {
					setResult(data);
					if (data.created > 0) {
						toast.success(
							t("issues.csv.importSuccess", { count: data.created }),
						);
					}
				},
				onError: (error) => toast.error(apiErrorMessage(t, error)),
			},
		);
	};

	const errorMessage = (error: IssueCsvRowError) =>
		t(CSV_ERROR_KEYS[error.code], {
			count: ISSUE_CSV_MAX_IMPORT_ROWS,
			value: error.value ?? "",
		});

	const rowErrors = preview?.errors.filter((error) => error.row > 0) ?? [];
	const fatalErrors = preview?.errors.filter((error) => error.row === 0) ?? [];

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant="outline" size="sm">
							<Upload className="size-4" />
							<span className="max-sm:hidden">{t("issues.csv.menu")}</span>
							<ChevronDown className="size-3" />
						</Button>
					}
				/>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={() => void handleExport()}>
						<Download />
						{t("issues.csv.export")}
					</DropdownMenuItem>
					<DropdownMenuItem disabled={frozen} onClick={() => setOpen(true)}>
						<Upload />
						{t("issues.csv.import")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>{t("issues.csv.importTitle")}</DialogTitle>
						<DialogDescription>
							{t("issues.csv.importDescription", {
								count: ISSUE_CSV_MAX_IMPORT_ROWS,
							})}
						</DialogDescription>
					</DialogHeader>

					{result ? (
						<div className="flex flex-col gap-3">
							<Alert>
								<AlertTitle>{t("issues.csv.resultTitle")}</AlertTitle>
								<AlertDescription>
									{t("issues.csv.resultSummary", {
										created: result.created,
										failed: result.errors.length,
									})}
								</AlertDescription>
							</Alert>
							{result.errors.length > 0 && (
								<Alert variant="destructive">
									<AlertTitle>{t("issues.csv.resultErrors")}</AlertTitle>
									<AlertDescription>
										<ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-sm">
											{result.errors.map((error) => (
												<li key={`${error.row}-${error.message}`}>
													<span className="font-medium">
														{t("issues.csv.rowLabel", { row: error.row })}:{" "}
													</span>
													{/* Server messages are not localized; show them verbatim. */}
													<span className="break-words">{error.message}</span>
												</li>
											))}
										</ul>
									</AlertDescription>
								</Alert>
							)}
							<DialogFooter>
								<Button onClick={() => onOpenChange(false)}>
									{t("issues.csv.done")}
								</Button>
							</DialogFooter>
						</div>
					) : (
						<div className="flex flex-col gap-3">
							<Field>
								<FieldLabel htmlFor="issue-csv-file">
									{t("issues.csv.chooseFile")}
								</FieldLabel>
								<Input
									id="issue-csv-file"
									ref={fileInput}
									type="file"
									accept=".csv,text/csv"
									onChange={(event) => void onFile(event.target.files?.[0])}
								/>
								<FieldDescription>
									{fileName || t("issues.csv.noFile")}
								</FieldDescription>
							</Field>

							{fileError && (
								<Alert variant="destructive">
									<AlertDescription>
										{fileError === "tooLarge"
											? t("issues.csv.fileTooLarge")
											: t("issues.csv.fileUnreadable")}
									</AlertDescription>
								</Alert>
							)}

							{preview && fatalErrors.length > 0 && (
								<Alert variant="destructive">
									<AlertTitle>{t("issues.csv.cannotImport")}</AlertTitle>
									<AlertDescription>
										{fatalErrors.map((error) => (
											<p key={error.code}>{errorMessage(error)}</p>
										))}
									</AlertDescription>
								</Alert>
							)}

							{preview && preview.rows.length > 0 && (
								<>
									<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
										<span>
											{t("issues.csv.rowCount", {
												count: preview.rows.length,
											})}
										</span>
										{rowErrors.length > 0 && (
											<span className="text-destructive">
												{t("issues.csv.rowErrors", {
													count: rowErrors.length,
												})}
											</span>
										)}
									</div>
									<div className="max-h-48 overflow-x-auto overflow-y-auto rounded-md border">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>{t("issues.titleField")}</TableHead>
													<TableHead>{t("issues.status")}</TableHead>
													<TableHead>{t("issues.priority")}</TableHead>
													<TableHead>{t("issues.assignee")}</TableHead>
													<TableHead>{t("issues.labels")}</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{preview.previewRows.map((row) => (
													<TableRow key={Object.values(row).join("\u0000")}>
														<TableCell className="max-w-48 truncate">
															{row.title}
														</TableCell>
														<TableCell>{row.status}</TableCell>
														<TableCell>{row.priority}</TableCell>
														<TableCell>{row.assignee}</TableCell>
														<TableCell>{row.labels}</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
									{rowErrors.length > 0 && (
										<div className="max-h-36 overflow-y-auto rounded-md border p-2">
											<ul className="flex flex-col gap-1 text-sm text-destructive">
												{rowErrors.map((error) => (
													<li
														key={`${error.row}-${error.code}-${error.value ?? ""}`}
													>
														{t("issues.csv.rowLabel", { row: error.row })}:{" "}
														{errorMessage(error)}
													</li>
												))}
											</ul>
										</div>
									)}
								</>
							)}

							<DialogFooter>
								<Button variant="outline" onClick={() => onOpenChange(false)}>
									{t("common.cancel")}
								</Button>
								<Button
									onClick={confirm}
									disabled={
										!preview ||
										preview.fatal ||
										preview.rows.length === 0 ||
										importMutation.isPending
									}
								>
									{importMutation.isPending && <Spinner />}
									{t("issues.csv.confirm", {
										count: preview?.rows.length ?? 0,
									})}
								</Button>
							</DialogFooter>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
