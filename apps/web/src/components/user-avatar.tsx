import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";

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
		<Avatar className={className ?? "size-5"}>
			<AvatarFallback className="text-[10px]">
				{initialsOf(name)}
			</AvatarFallback>
		</Avatar>
	);
}
