import { cn } from "@workspace/ui/lib/utils";
import { CheckIcon } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "./radio-group";

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
		<RadioGroup
			data-slot="color-swatch-picker"
			aria-label={ariaLabel}
			value={value}
			onValueChange={(next) => {
				if (typeof next === "string") onChange(next);
			}}
			className={cn("flex flex-wrap items-center gap-2", className)}
		>
			{SWATCHES.map((swatch) => {
				const selected = swatch === value;
				return (
					<RadioGroupItem
						key={swatch}
						value={swatch}
						aria-label={swatch}
						className={cn(
							"flex size-7 shrink-0 items-center justify-center border-0 outline-none after:hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_[data-slot=radio-group-indicator]]:hidden",
							selected &&
								"ring-2 ring-ring ring-offset-2 ring-offset-background",
						)}
						style={{ backgroundColor: swatch }}
					>
						{selected && <CheckIcon className="size-4 text-white" />}
					</RadioGroupItem>
				);
			})}
		</RadioGroup>
	);
}

export { ColorSwatchPicker };
