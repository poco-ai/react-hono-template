import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { AUDIT_ACTIONS, type AuditAction } from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { TablePagination } from "@/components/table-pagination";
import { auditQuery, exportAuditCsv } from "@/features/audit/data";
import { apiErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { pageCount } from "@/lib/pagination";
import { useDocumentTitle } from "@/lib/use-document-title";

export function AuditSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("audit.title"));
	const search = useSearch({ from: "/_auth/orgs/$orgId/settings/audit" });
	const navigate = useNavigate({ from: "/orgs/$orgId/settings/audit" });
	const page = search.page ?? 1;
	const [actorInput, setActorInput] = useState(search.actorId ?? "");
	const [exporting, setExporting] = useState(false);
	const query = useQuery(
		auditQuery(orgId, {
			page,
			action: search.action,
			actorId: search.actorId,
			from: search.from,
			to: search.to,
		}),
	);
	const totalPages = query.data ? pageCount(query.data) : 1;

	const updateSearch = (patch: Partial<typeof search>) =>
		navigate({ search: (prev) => ({ ...prev, page: 1, ...patch }) });

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-xl font-semibold">{t("audit.title")}</h1>
				</div>
				<Button
					variant="outline"
					disabled={exporting}
					onClick={() => {
						setExporting(true);
						void exportAuditCsv(orgId, {
							page: 1,
							action: search.action,
							actorId: search.actorId,
							from: search.from,
							to: search.to,
						}).finally(() => setExporting(false));
					}}
				>
					{t("audit.export")}
				</Button>
			</div>
			<div className="grid gap-3 sm:grid-cols-4">
				<Field>
					<FieldLabel>{t("audit.action")}</FieldLabel>
					<Select
						value={search.action ?? "all"}
						onValueChange={(value) =>
							updateSearch({
								action:
									value && (AUDIT_ACTIONS as readonly string[]).includes(value)
										? (value as AuditAction)
										: undefined,
							})
						}
					>
						<SelectTrigger>
							<SelectValue>
								{search.action
									? t(`audit.actions.${search.action}`)
									: t("audit.allActions")}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">{t("audit.allActions")}</SelectItem>
							{AUDIT_ACTIONS.map((action) => (
								<SelectItem key={action} value={action}>
									{t(`audit.actions.${action}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<Field>
					<FieldLabel>{t("audit.actor")}</FieldLabel>
					<Input
						value={actorInput}
						placeholder={t("audit.actorPlaceholder")}
						onChange={(event) => setActorInput(event.target.value)}
						onBlur={() =>
							updateSearch({ actorId: actorInput.trim() || undefined })
						}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								updateSearch({ actorId: actorInput.trim() || undefined });
							}
						}}
					/>
				</Field>
				<Field>
					<FieldLabel>{t("audit.from")}</FieldLabel>
					<Input
						type="datetime-local"
						value={search.from ? search.from.slice(0, 16) : ""}
						onChange={(event) =>
							updateSearch({
								from: event.target.value
									? new Date(event.target.value).toISOString()
									: undefined,
							})
						}
					/>
				</Field>
				<Field>
					<FieldLabel>{t("audit.to")}</FieldLabel>
					<Input
						type="datetime-local"
						value={search.to ? search.to.slice(0, 16) : ""}
						onChange={(event) =>
							updateSearch({
								to: event.target.value
									? new Date(event.target.value).toISOString()
									: undefined,
							})
						}
					/>
				</Field>
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{t("audit.time")}</TableHead>
						<TableHead>{t("audit.action")}</TableHead>
						<TableHead>{t("audit.actor")}</TableHead>
						<TableHead>{t("audit.target")}</TableHead>
						<TableHead>{t("audit.result")}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{query.data?.items.map((event) => (
						<TableRow key={event.id}>
							<TableCell className="text-muted-foreground text-xs">
								{formatDateTime(
									typeof event.createdAt === "string"
										? event.createdAt
										: new Date(event.createdAt).toISOString(),
								)}
							</TableCell>
							<TableCell>
								{(AUDIT_ACTIONS as readonly string[]).includes(event.action)
									? t(`audit.actions.${event.action as AuditAction}`)
									: event.action}
							</TableCell>
							<TableCell className="font-mono text-xs">
								{event.actorId ?? event.actorType}
							</TableCell>
							<TableCell className="text-xs">
								{[event.targetType, event.targetId].filter(Boolean).join(" ")}
							</TableCell>
							<TableCell>{event.result}</TableCell>
						</TableRow>
					))}
					{query.isError && (
						<TableRow>
							<TableCell colSpan={5} className="text-center text-destructive">
								{apiErrorMessage(t, query.error)}
							</TableCell>
						</TableRow>
					)}
					{!query.isPending && query.data?.items.length === 0 && (
						<TableRow>
							<TableCell colSpan={5} className="p-0">
								<EmptyState title={t("audit.empty")} />
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
			<TablePagination
				page={page}
				total={query.data?.total}
				totalPages={totalPages}
				onPageChange={(next) =>
					navigate({ search: (prev) => ({ ...prev, page: next }) })
				}
				disabled={query.isPending}
			/>
		</div>
	);
}
