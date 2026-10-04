import { cn } from "@workspace/ui/lib/utils";
import { CheckIcon } from "lucide-react";

const SWATCHES: readonly string[] = [
	"#6366f1",
	"#8b5cf6",
	"#d946ef",
	"#ec4899",
	"#ef4444",
	"#f97316",
	"#eab308",
	"#22c55e",
	"#06b6d4",
	"#94a3b8",
];

function ColorSwatchPicker({
	value,
	onChange,
	ariaLabel,
	className,
}: {
	value: string;
	onChange: (value: string) => void;
	ariaLabel?: string;
	className?: string;
}) {
	return (
		<div
			data-slot="color-swatch-picker"
			role="radiogroup"
			aria-label={ariaLabel}
			className={cn("flex flex-wrap items-center gap-2", className)}
		>
			{SWATCHES.map((swatch) => {
				const selected = swatch === value;
				return (
					// biome-ignore lint/a11y/useSemanticElements: swatch buttons implement the radio pattern; a native radio input cannot render the color swatch
					<button
						key={swatch}
						type="button"
						role="radio"
						aria-checked={selected}
						aria-label={swatch}
						onClick={() => onChange(swatch)}
						className={cn(
							"flex size-7 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
							selected &&
								"ring-2 ring-ring ring-offset-2 ring-offset-background",
						)}
						style={{ backgroundColor: swatch }}
					>
						{selected && <CheckIcon className="size-4 text-white" />}
					</button>
				);
			})}
		</div>
	);
}

export { ColorSwatchPicker, SWATCHES };
