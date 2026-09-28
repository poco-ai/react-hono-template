import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
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
}: {
	value: string[];
	options: MultiSelectOption[];
	onChange: (next: string[]) => void;
	placeholder: string;
	className?: string;
}) {
	const { t } = useTranslation();
	const selected = options.filter((option) => value.includes(option.value));

	const toggle = (option: MultiSelectOption) => {
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
					<Button variant="outline" size="sm" className={className}>
						<span className="max-w-48 truncate">
							{selected.length > 0
								? selected.map((option) => option.label).join(", ")
								: placeholder}
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
