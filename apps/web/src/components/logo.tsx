import { cn } from "@workspace/ui/lib/utils";

export function Logo({ className }: { className?: string }) {
	return (
		<div className={cn("flex items-center gap-2", className)}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 32 32"
				className="size-6 shrink-0 dark:invert"
				aria-hidden="true"
			>
				<rect width="32" height="32" rx="9" fill="#000" />
				<path d="M16 7 24.5 11.5 16 16 7.5 11.5Z" fill="#fff" />
				<path
					d="m7.7 15.4 8.3 4.4 8.3-4.4"
					stroke="#fff"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					fill="none"
					opacity="0.7"
				/>
				<path
					d="m7.7 19.6 8.3 4.4 8.3-4.4"
					stroke="#fff"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					fill="none"
					opacity="0.4"
				/>
			</svg>
			<span className="text-sm font-medium">React Hono Template</span>
		</div>
	);
}
