import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { AtSign, Check, Copy } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Components } from "react-markdown";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
	MENTION_HREF_PREFIX,
	mentionUserIdFromHref,
	renderMentionMarkup,
} from "@/lib/mention";

/** Rendered `@[Name](user:ID)` mentions — never a clickable external link. */
function MentionLabel({ children }: { children: ReactNode }) {
	return (
		<Badge
			variant="secondary"
			className="mx-0.5 bg-primary/10 align-baseline text-primary"
		>
			<AtSign />
			{children}
		</Badge>
	);
}

function CodeBlock({
	children,
	language,
}: {
	children?: ReactNode;
	language?: string;
}) {
	const { t } = useTranslation();
	const preRef = useRef<HTMLPreElement>(null);
	const [copied, setCopied] = useState(false);

	const onCopy = async () => {
		const text = preRef.current?.querySelector("code")?.textContent ?? "";
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1600);
		} catch {
			setCopied(false);
		}
	};

	return (
		<div className="group/code bg-muted relative mb-2 w-fit max-w-full overflow-hidden rounded-lg border last:mb-0">
			<pre ref={preRef} className="overflow-x-auto p-3 text-xs">
				{children}
			</pre>
			<div className="absolute top-1.5 right-1.5 flex items-center gap-1">
				{language && (
					<span className="bg-background/80 text-muted-foreground rounded border px-1 py-0.5 font-mono text-[10px] uppercase">
						{language}
					</span>
				)}
				<Button
					type="button"
					variant="outline"
					size="xs"
					onClick={() => void onCopy()}
					className={cn(
						"bg-background font-mono text-[10px] opacity-0 transition-opacity group-hover/code:opacity-100 focus-visible:opacity-100",
						copied ? "text-primary" : "text-muted-foreground",
					)}
				>
					{copied ? <Check /> : <Copy />}
					{copied ? t("common.copied") : t("markdown.copyCode")}
				</Button>
			</div>
		</div>
	);
}

const components: Components = {
	h1: ({ children }) => (
		<h1 className="mt-5 mb-2 text-lg font-semibold">{children}</h1>
	),
	h2: ({ children }) => (
		<h2 className="mt-5 mb-2 text-base font-semibold">{children}</h2>
	),
	h3: ({ children }) => (
		<h3 className="mt-4 mb-1.5 text-sm font-semibold">{children}</h3>
	),
	h4: ({ children }) => (
		<h4 className="mt-3 mb-1 text-sm font-semibold">{children}</h4>
	),
	p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
	ul: ({ children }) => (
		<ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>
	),
	ol: ({ children }) => (
		<ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>
	),
	li: ({ children }) => <li className="mb-0.5 last:mb-0">{children}</li>,
	a: ({ href, children }) => {
		if (mentionUserIdFromHref(href)) {
			return <MentionLabel>{children}</MentionLabel>;
		}
		// Unsafe schemes (including hand-written `user:` links) are stripped by
		// the url transform; never render them as anchors.
		if (!href) {
			return <span className="font-medium">{children}</span>;
		}
		return (
			<a
				href={href}
				target="_blank"
				rel="noreferrer"
				className="text-primary hover:underline"
			>
				{children}
			</a>
		);
	},
	blockquote: ({ children }) => (
		<blockquote className="border-l-2 pl-3 italic">{children}</blockquote>
	),
	code: ({ className, children }) =>
		className?.includes("language-") ? (
			<code className={`${className} font-mono text-xs`}>{children}</code>
		) : (
			<code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
				{children}
			</code>
		),
	pre: ({ children, node }) => {
		const first = node?.children[0];
		let language: string | undefined;
		if (first?.type === "element") {
			const classes = first.properties?.className;
			const langClass = Array.isArray(classes)
				? classes.find(
						(c): c is string =>
							typeof c === "string" && c.startsWith("language-"),
					)
				: undefined;
			if (langClass) {
				language = langClass.slice("language-".length);
			}
		}
		return <CodeBlock language={language}>{children}</CodeBlock>;
	},
	hr: () => <hr className="my-4" />,
	table: ({ children }) => (
		<div className="mb-2 last:mb-0">
			<Table className="text-xs">{children}</Table>
		</div>
	),
	thead: ({ children }) => <TableHeader>{children}</TableHeader>,
	tbody: ({ children }) => <TableBody>{children}</TableBody>,
	tr: ({ children }) => (
		<TableRow className="hover:bg-transparent">{children}</TableRow>
	),
	th: ({ children }) => (
		<TableHead className="h-auto border px-2 py-1 whitespace-normal">
			{children}
		</TableHead>
	),
	td: ({ children }) => (
		<TableCell className="border px-2 py-1 whitespace-normal">
			{children}
		</TableCell>
	),
	img: ({ src, alt }) => (
		<img
			src={src}
			alt={alt ?? ""}
			loading="lazy"
			className="max-h-96 rounded-md border"
		/>
	),
};

export function MarkdownContent({ children }: { children: string }) {
	return (
		<div className="text-sm leading-relaxed break-words">
			<Markdown
				remarkPlugins={[remarkGfm]}
				components={components}
				urlTransform={(url) =>
					url.startsWith(MENTION_HREF_PREFIX) ? url : defaultUrlTransform(url)
				}
			>
				{renderMentionMarkup(children)}
			</Markdown>
		</div>
	);
}
