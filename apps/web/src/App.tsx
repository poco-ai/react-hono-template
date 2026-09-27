import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AppLayout } from "@/components/app-layout";
import { RequireAuth, RequireRole } from "@/components/require-auth";
import { AdminUsersPage } from "@/pages/admin-users";
import { HomePage } from "@/pages/home";
import { LoginPage } from "@/pages/login";
import { RegisterPage } from "@/pages/register";

export function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route path="/register" element={<RegisterPage />} />
				<Route element={<RequireAuth />}>
					<Route element={<AppLayout />}>
						<Route path="/" element={<HomePage />} />
						<Route element={<RequireRole allow="admin" />}>
							<Route path="/admin/users" element={<AdminUsersPage />} />
						</Route>
					</Route>
				</Route>
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</BrowserRouter>
	);
}
