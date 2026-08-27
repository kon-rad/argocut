/**
 * ArgoCut runs locally by default, so the canonical URL is whatever it is being
 * served from rather than a hardcoded domain. Only robots.txt, the sitemap and
 * the RSS feed use it.
 */
export const SITE_URL =
	process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const SITE_INFO = {
	title: "ArgoCut",
	description:
		"A video editor in your browser, scoped to your brand. Projects and brands in Postgres, media and style guides on disk.",
	url: SITE_URL,
	openGraphImage: "/open-graph/default.jpg",
	twitterImage: "/open-graph/default.jpg",
	favicon: "/favicon.ico",
};

export const DEFAULT_LOGO_URL = "/logos/argocut/svg/logo.svg";
