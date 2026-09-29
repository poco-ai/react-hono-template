import { cn } from "@workspace/ui/lib/utils";

export function Logo({ className }: { className?: string }) {
	return (
		<div className={cn("flex items-center gap-2", className)}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 32 32"
				className="size-6 shrink-0"
				aria-hidden="true"
			>
				<rect width="32" height="32" rx="8" fill="#6366f1" />
				<path
					d="M10 16.5l4 4 8-9"
					fill="none"
					stroke="#fff"
					strokeWidth="3"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
			<span className="text-sm font-medium">React Hono Template</span>
		</div>
	);
}
