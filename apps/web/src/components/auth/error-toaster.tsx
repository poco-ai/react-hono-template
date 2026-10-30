import { useAuthErrorToasts } from "@/lib/auth/use-auth-error-toasts";

export function ErrorToaster() {
	useAuthErrorToasts();
	return null;
}
