import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SOCIAL_LINKS } from "@/site/social";

const MODES: { title: string; description: string }[] = [
	{
		title: "Hand it a folder",
		description:
			"Point any MCP-capable agent, Claude Code, Codex, Hermes, at a folder of raw footage. It probes the clips, transcribes the speech, plans the cut, then assembles the whole project through the MCP server: create a project, import the media, apply the edit as one batch, hand off. You get back a URL with the timeline still fully editable and the agent's work sitting in the undo stack.",
	},
	{
		title: "Watch it work",
		description:
			"Keep a project open in your own browser tab and let the agent cut it live, driven through the same commands as a Claude Code skill rather than a separate headless server. Nothing happens out of view.",
	},
];

export function AgentWorkflow() {
	return (
		<section className="border-t">
			<div className="mx-auto w-full max-w-3xl px-4 py-20">
				<h2 className="text-2xl font-bold tracking-tight md:text-3xl">
					Edit it with your own agent
				</h2>
				<p className="text-muted-foreground mt-4 max-w-xl text-base leading-relaxed">
					ArgoCut ships an MCP server so an agent can drive the timeline
					directly, the same way a human does, through the editor's own
					command and undo layer. Let it do 90% of the edit and finish the
					last 10% yourself, or let it go all the way to export-ready.
				</p>

				<div className="mt-10 grid gap-6 sm:grid-cols-2">
					{MODES.map((mode) => (
						<div key={mode.title} className="rounded-2xl border p-6">
							<h3 className="text-foreground font-semibold">{mode.title}</h3>
							<p className="text-muted-foreground mt-2 text-sm leading-relaxed">
								{mode.description}
							</p>
						</div>
					))}
				</div>

				<Link
					href={`${SOCIAL_LINKS.github}/blob/main/docs/agent-editing-modes.md`}
					target="_blank"
					rel="noopener noreferrer"
					className="text-foreground mt-8 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4"
				>
					How the MCP server and skills work
					<ArrowRight className="size-3.5" />
				</Link>
			</div>
		</section>
	);
}
