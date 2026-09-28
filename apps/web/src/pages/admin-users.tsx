import type { ListAdminUsersDto } from "@api/dto/admin-user.dto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
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
import { useState } from "react";
import { client, unwrap } from "@/lib/api";
import { useSession } from "@/lib/session";

const PAGE_SIZE = 10;

export function AdminUsersPage() {
	const { data: session } = useSession();
	const { page = 1, search = "" } = useSearch({ from: "/_auth/admin/users" });
	const navigate = useNavigate({ from: "/admin/users" });
	const queryClient = useQueryClient();
	const [searchInput, setSearchInput] = useState(search);

	const usersQuery = useQuery({
		queryKey: ["admin-users", page, search],
		queryFn: () =>
			unwrap(
				client.api.admin.users.$get({
					query: {
						page: String(page),
						pageSize: String(PAGE_SIZE),
						search,
					},
				}),
			),
	});

	const roleMutation = useMutation({
		mutationFn: ({ id, role }: { id: string; role: "admin" | "user" }) =>
			unwrap(
				client.api.admin.users[":id"].role.$patch({
					param: { id },
					json: { role },
				}),
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
	});
	const banMutation = useMutation({
		mutationFn: (id: string) =>
			unwrap(
				client.api.admin.users[":id"].ban.$post({ param: { id }, json: {} }),
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
	});
	const unbanMutation = useMutation({
		mutationFn: (id: string) =>
			unwrap(client.api.admin.users[":id"].ban.$delete({ param: { id } })),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
	});

	const onSearch = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		navigate({ search: { page: 1, search: searchInput.trim() } });
	};

	const gotoPage = (next: number) =>
		navigate({ search: (prev) => ({ ...prev, page: next }) });

	const result: ListAdminUsersDto | undefined = usersQuery.data;
	const totalPages = result
		? Math.max(1, Math.ceil(result.total / result.pageSize))
		: 1;
	const mutating =
		roleMutation.isPending || banMutation.isPending || unbanMutation.isPending;
	const mutationError =
		roleMutation.error ?? banMutation.error ?? unbanMutation.error;

	return (
		<Card>
			<CardHeader>
				<CardTitle>User management</CardTitle>
				<CardDescription>
					Admin-only area, guarded by RBAC permissions. Page and search live in
					the URL.
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

				{mutationError && (
					<p className="text-sm text-red-500">{mutationError.message}</p>
				)}

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
											disabled={isSelf || roleMutation.isPending}
											onValueChange={(v) => {
												if (v) {
													roleMutation.mutate({
														id: user.id,
														role: v as "admin" | "user",
													});
												}
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
												disabled={mutating}
												onClick={() => unbanMutation.mutate(user.id)}
											>
												Unban
											</Button>
										) : (
											<Button
												variant="destructive"
												size="sm"
												disabled={isSelf || user.role === "admin" || mutating}
												onClick={() => banMutation.mutate(user.id)}
											>
												Ban
											</Button>
										)}
									</TableCell>
								</TableRow>
							);
						})}
						{usersQuery.isPending && (
							<TableRow>
								<TableCell
									colSpan={5}
									className="text-muted-foreground h-16 text-center"
								>
									Loading…
								</TableCell>
							</TableRow>
						)}
						{usersQuery.isError && (
							<TableRow>
								<TableCell colSpan={5} className="text-center text-red-500">
									{usersQuery.error.message}
								</TableCell>
							</TableRow>
						)}
						{!usersQuery.isPending && result?.items.length === 0 && (
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
							disabled={page <= 1 || usersQuery.isPending}
							onClick={() => gotoPage(page - 1)}
						>
							Prev
						</Button>
						<span>
							Page {page} / {totalPages}
						</span>
						<Button
							variant="outline"
							size="sm"
							disabled={page >= totalPages || usersQuery.isPending}
							onClick={() => gotoPage(page + 1)}
						>
							Next
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
