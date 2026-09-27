import type { ListAdminUsersDto } from "@api/dto/admin-user.dto";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
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
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { client, unwrap } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

const PAGE_SIZE = 10;

const errorMessage = (e: unknown) =>
	e instanceof Error ? e.message : String(e);

export function AdminUsersPage() {
	const { data: session } = authClient.useSession();
	const [page, setPage] = useState(1);
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [result, setResult] = useState<ListAdminUsersDto | null>(null);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const data = await unwrap(
				await client.api.admin.users.$get({
					query: { page: String(page), pageSize: String(PAGE_SIZE), search },
				}),
			);
			setResult(data);
			setError("");
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setLoading(false);
		}
	}, [page, search]);

	useEffect(() => {
		load();
	}, [load]);

	const onSearch = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setPage(1);
		setSearch(searchInput.trim());
	};

	const run = async (fn: () => Promise<unknown>) => {
		try {
			await fn();
			setError("");
			await load();
		} catch (e) {
			setError(errorMessage(e));
		}
	};

	const changeRole = (id: string, role: string) =>
		run(() =>
			client.api.admin.users[":id"].role
				.$patch({
					param: { id },
					json: { role: role as "admin" | "user" },
				})
				.then(unwrap),
		);

	const ban = (id: string) =>
		run(() =>
			client.api.admin.users[":id"].ban
				.$post({ param: { id }, json: {} })
				.then(unwrap),
		);

	const unban = (id: string) =>
		run(() =>
			client.api.admin.users[":id"].ban.$delete({ param: { id } }).then(unwrap),
		);

	const totalPages = result
		? Math.max(1, Math.ceil(result.total / result.pageSize))
		: 1;

	return (
		<Card>
			<CardHeader>
				<CardTitle>User management</CardTitle>
				<CardDescription>
					Admin-only area, guarded by RBAC permissions.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<form className="flex gap-2" onSubmit={onSearch}>
					<Input
						placeholder="Search by name or email..."
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						className="max-w-xs"
					/>
					<Button type="submit" variant="outline">
						Search
					</Button>
				</form>

				{error && <p className="text-sm text-red-500">{error}</p>}

				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>User</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Created</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{result?.items.map((user) => {
							const isSelf = user.id === session?.user.id;
							return (
								<TableRow key={user.id}>
									<TableCell>
										<div className="font-medium">{user.name}</div>
										<div className="text-muted-foreground text-xs">
											{user.email}
										</div>
									</TableCell>
									<TableCell>
										<Select
											value={user.role}
											disabled={isSelf}
											onValueChange={(v) => {
												if (v) changeRole(user.id, v);
											}}
										>
											<SelectTrigger className="w-28">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="admin">admin</SelectItem>
												<SelectItem value="user">user</SelectItem>
											</SelectContent>
										</Select>
									</TableCell>
									<TableCell>
										{user.banned ? (
											<Badge variant="destructive">
												{user.banReason
													? `banned: ${user.banReason}`
													: "banned"}
											</Badge>
										) : (
											<Badge variant="outline">active</Badge>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										{new Date(user.createdAt).toLocaleDateString()}
									</TableCell>
									<TableCell className="text-right">
										{user.banned ? (
											<Button
												variant="outline"
												size="sm"
												onClick={() => unban(user.id)}
											>
												Unban
											</Button>
										) : (
											<Button
												variant="destructive"
												size="sm"
												disabled={isSelf || user.role === "admin"}
												onClick={() => ban(user.id)}
											>
												Ban
											</Button>
										)}
									</TableCell>
								</TableRow>
							);
						})}
						{!loading && result?.items.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={5}
									className="text-muted-foreground h-16 text-center"
								>
									No users found.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>

				<div className="text-muted-foreground flex items-center justify-between text-sm">
					<span>{result ? `${result.total} user(s)` : ""}</span>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={page <= 1 || loading}
							onClick={() => setPage((p) => p - 1)}
						>
							Prev
						</Button>
						<span>
							Page {page} / {totalPages}
						</span>
						<Button
							variant="outline"
							size="sm"
							disabled={page >= totalPages || loading}
							onClick={() => setPage((p) => p + 1)}
						>
							Next
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
