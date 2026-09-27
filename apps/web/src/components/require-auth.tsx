import { Navigate, Outlet, useLocation } from "react-router";
import { authClient } from "@/lib/auth-client";

function LoadingScreen() {
	return (
		<div className="flex min-h-svh items-center justify-center">
			<p className="text-muted-foreground text-sm">Loading...</p>
		</div>
	);
}

export function RequireAuth() {
	const location = useLocation();
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return <LoadingScreen />;
	}
	if (!session) {
		return <Navigate to="/login" replace state={{ from: location.pathname }} />;
	}
	return <Outlet />;
}

export function RequireRole({ allow }: { allow: string }) {
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return <LoadingScreen />;
	}
	if (session?.user.role !== allow) {
		return (
			<div className="flex min-h-svh items-center justify-center">
				<p className="text-muted-foreground text-sm">
					403 — You do not have permission to view this page.
				</p>
			</div>
		);
	}
	return <Outlet />;
}
