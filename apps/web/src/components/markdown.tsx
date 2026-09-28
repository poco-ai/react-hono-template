import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
	a: ({ href, children }) => (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className="text-primary hover:underline"
		>
			{children}
		</a>
	),
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
	pre: ({ children }) => (
		<pre className="bg-muted mb-2 overflow-x-auto rounded-md p-3 text-xs last:mb-0">
			{children}
		</pre>
	),
	hr: () => <hr className="my-4" />,
	table: ({ children }) => (
		<div className="mb-2 overflow-x-auto last:mb-0">
			<table className="w-full border-collapse text-xs">{children}</table>
		</div>
	),
	th: ({ children }) => (
		<th className="border px-2 py-1 text-left font-semibold">{children}</th>
	),
	td: ({ children }) => <td className="border px-2 py-1">{children}</td>,
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
			<Markdown remarkPlugins={[remarkGfm]} components={components}>
				{children}
			</Markdown>
		</div>
	);
}
