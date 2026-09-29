import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { cn } from "@workspace/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface MultiSelectOption {
	value: string;
	label: string;
}

export function MultiSelect({
	value,
	options,
	onChange,
	placeholder,
	className,
	disabled,
	active,
	triggerLabel,
}: {
	value: string[];
	options: MultiSelectOption[];
	onChange: (next: string[]) => void;
	placeholder: string;
	className?: string;
	disabled?: boolean;
	active?: boolean;
	triggerLabel?: string;
}) {
	const { t } = useTranslation();
	const selected = options.filter((option) => value.includes(option.value));

	const toggle = (option: MultiSelectOption) => {
		if (disabled) {
			return;
		}
		onChange(
			value.includes(option.value)
				? value.filter((v) => v !== option.value)
				: [...value, option.value],
		);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant={active ? "secondary" : "outline"}
						size="sm"
						className={className}
						disabled={disabled}
					>
						<span
							className={cn(
								"max-w-48 truncate",
								selected.length === 0 && "text-muted-foreground",
							)}
						>
							{triggerLabel ??
								(selected.length > 0
									? selected.map((option) => option.label).join(", ")
									: placeholder)}
						</span>
						<ChevronDown className="text-muted-foreground size-4" />
					</Button>
				}
			/>
			<DropdownMenuContent align="start" className="min-w-44">
				{options.map((option) => (
					<DropdownMenuCheckboxItem
						key={option.value}
						checked={value.includes(option.value)}
						closeOnClick={false}
						onCheckedChange={() => toggle(option)}
					>
						{option.label}
					</DropdownMenuCheckboxItem>
				))}
				{options.length === 0 && (
					<p className="text-muted-foreground px-1.5 py-1 text-sm">
						{t("common.noOptions")}
					</p>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
