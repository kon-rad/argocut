import { Hero } from "@/components/landing/hero";
import { ProductOverview } from "@/components/landing/product-overview";
import { AgentWorkflow } from "@/components/landing/agent-workflow";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import type { Metadata } from "next";
import { SITE_URL } from "@/site/brand";

export const metadata: Metadata = {
	alternates: {
		canonical: SITE_URL,
	},
};

export default async function Home() {
	return (
		<div>
			<Header />
			<Hero />
			<ProductOverview />
			<AgentWorkflow />
			<Footer />
		</div>
	);
}
