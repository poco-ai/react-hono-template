import { enUS } from "@better-auth-ui/locales/en-US";
import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	type ErrorComponentProps,
	Link,
	type LinkProps,
	Outlet,
	useNavigate,
	useRouteContext,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Toaster } from "@workspace/ui/components/sonner";
import { type ComponentPropsWithoutRef, type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AuthProvider } from "@/components/auth/auth-provider";
import { NotFoundState } from "@/components/not-found-state";
import { useTheme } from "@/components/theme-provider";
import {
	oauthProvidersQuery,
	useRefreshSessionOnUserUpdate,
} from "@/features/auth/data";
import { adminFlowLocalization } from "@/lib/auth/admin-localization";
import { adminPlugin } from "@/lib/auth/admin-plugin";
import {
	accountSettingsLocalization,
	authFlowLocalization,
	organizationFlowLocalization,
} from "@/lib/auth/auth-localization";
import { organizationPlugin } from "@/lib/auth/organization-plugin";
import { resolveSafeRedirect } from "@/lib/auth/safe-redirect";
import { themePlugin } from "@/lib/auth/theme-plugin";
import { authClient } from "@/lib/auth-client";

export interface RouterContext {
	queryClient: QueryClient;
}

function NotFound() {
	const { t } = useTranslation();
	return (
		<NotFoundState
			title={t("notFound.title")}
			action={
				<Link
					to="/"
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					{t("notFound.backHome")}
				</Link>
			}
		/>
	);
}

function RootError({ error, reset }: ErrorComponentProps) {
	const { t } = useTranslation();
	const router = useRouter();

	console.error(error);

	return (
		<NotFoundState
			title={t("error.title")}
			description={t("error.description")}
			action={
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							router.invalidate();
							reset();
						}}
					>
						{t("error.retry")}
					</Button>
					<Link
						to="/"
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						{t("notFound.backHome")}
					</Link>
				</div>
			}
		/>
	);
}

type AuthHref = {
	to: string;
	search?: Record<string, string>;
	hash?: string;
};

// Better Auth UI passes a string `href`. TanStack's `to` is the registered
// route union, so the runtime path is asserted at the router boundary.
type AppTo = LinkProps["to"];
type AppSearch = LinkProps["search"];

function parseAuthHref(href: string): AuthHref {
	const url = new URL(href, "http://localhost");
	const search: Record<string, string> = {};
	for (const [key, value] of url.searchParams) {
		search[key] = value;
	}
	return {
		to: url.pathname,
		...(Object.keys(search).length > 0 ? { search } : {}),
		...(url.hash ? { hash: url.hash.slice(1) } : {}),
	};
}

function AuthLink({
	href,
	children,
	...props
}: {
	href: string;
	className?: string;
	children?: ReactNode;
} & Pick<
	ComponentPropsWithoutRef<"a">,
	"aria-disabled" | "tabIndex" | "onClick"
>) {
	const location = parseAuthHref(href);
	return (
		<Link
			{...props}
			to={location.to as AppTo}
			search={location.search as AppSearch}
			hash={location.hash}
		>
			{children}
		</Link>
	);
}

function useAuthTheme() {
	const { theme, setTheme } = useTheme();
	return {
		theme,
		themes: ["system", "light", "dark"],
		setTheme: (value: string) => {
			if (value === "system" || value === "light" || value === "dark")
				setTheme(value);
		},
	};
}

function RootComponent() {
	const { theme } = useTheme();
	const { t, i18n } = useTranslation();
	const { queryClient } = useRouteContext({ from: "__root__" });
	const navigate = useNavigate();
	const redirectParam = useRouterState({
		select: (state) =>
			new URLSearchParams(state.location.searchStr).get("redirect"),
	});
	const redirectTo = useMemo(
		() => resolveSafeRedirect(redirectParam),
		[redirectParam],
	);
	const { data: oauth } = useQuery(oauthProvidersQuery());
	const socialProviders = useMemo(
		() => oauth?.providers ?? [],
		[oauth?.providers],
	);
	const plugins = useMemo(
		() => [
			adminPlugin({
				roles: ["user", "admin"],
				defaultRole: "user",
				allowMultipleRoles: false,
				pageSize: 10,
			}),
			themePlugin({ useTheme: useAuthTheme }),
			organizationPlugin({
				slugPrefix: "",
				allowMultipleRoles: false,
				logo: { enabled: false },
			}),
		],
		[],
	);
	const locale = useMemo(() => {
		const auth = {
			...enUS.localization.auth,
			...authFlowLocalization(t),
		};
		return {
			...enUS,
			languageTag: i18n.language.toLowerCase().startsWith("zh")
				? "zh-CN"
				: enUS.languageTag,
			localization: {
				...enUS.localization,
				auth,
				settings: {
					...enUS.localization.settings,
					...accountSettingsLocalization(t),
				},
			},
			plugins: {
				...enUS.plugins,
				admin: adminFlowLocalization(t),
				theme: {
					appearance: t("securityUi.appearance"),
					theme: t("theme.toggle"),
					system: t("theme.system"),
					light: t("theme.light"),
					dark: t("theme.dark"),
				},
				organization: {
					...enUS.plugins.organization,
					...organizationFlowLocalization(t),
				},
			},
		};
	}, [i18n.language, t]);
	useRefreshSessionOnUserUpdate();

	return (
		<AuthProvider
			authClient={authClient}
			queryClient={queryClient}
			navigate={(options) => {
				const location = parseAuthHref(resolveSafeRedirect(options.to));
				void navigate({
					to: location.to as AppTo,
					search: location.search as AppSearch,
					hash: location.hash,
					replace: options.replace,
				});
			}}
			Link={AuthLink}
			redirectTo={redirectTo}
			avatar={{ enabled: false }}
			emailAndPassword={{
				enabled: true,
				requireEmailVerification: false,
			}}
			socialProviders={socialProviders}
			basePaths={{
				auth: "",
				settings: "",
			}}
			viewPaths={{
				auth: {
					signIn: "login",
					signUp: "register",
					forgotPassword: "forgot-password",
					resetPassword: "reset-password",
					resetLinkSent: "reset-link-sent",
				},
			}}
			plugins={plugins}
			locale={locale}
		>
			<Toaster theme={theme} />
			<Outlet />
		</AuthProvider>
	);
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
	notFoundComponent: NotFound,
	errorComponent: RootError,
});
