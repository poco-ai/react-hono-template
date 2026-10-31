import { UserAvatar as AuthUserAvatar } from "@/components/auth/user/user-avatar";

export function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) {
		return "?";
	}
	const first = parts[0][0] ?? "";
	const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
	return (first + last).toUpperCase() || "?";
}

export function UserAvatar({
	name,
	className,
}: {
	name: string;
	className?: string;
}) {
	return (
		<AuthUserAvatar
			user={{ name }}
			fallback={initialsOf(name)}
			className={className ?? "size-5 text-[10px]"}
		/>
	);
}
