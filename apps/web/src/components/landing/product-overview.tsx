import {
	Table,
	TableBody,
	TableCell,
	TableRow,
} from "@/components/ui/table";

const STACK: { layer: string; tech: string }[] = [
	{ layer: "Web app", tech: "Next.js, React" },
	{ layer: "Renderer", tech: "Rust + WASM, GPU compositor" },
	{
		layer: "Storage",
		tech: "Postgres for projects and brands, disk for media and style guides",
	},
	{
		layer: "Agent bridge",
		tech: "MCP server (Bun + Playwright) driving window.__argocutAgent",
	},
];

export function ProductOverview() {
	return (
		<section className="mx-auto w-full max-w-3xl px-4 py-20">
			<h2 className="text-2xl font-bold tracking-tight md:text-3xl">
				What ArgoCut is
			</h2>
			<p className="text-muted-foreground mt-4 max-w-xl text-base leading-relaxed">
				ArgoCut is a fork of{" "}
				<a
					href="https://github.com/OpenCut-app/OpenCut"
					target="_blank"
					rel="noopener noreferrer"
					className="text-foreground underline underline-offset-4"
				>
					OpenCut
				</a>{" "}
				with two things added: <strong className="text-foreground">
					brands
				</strong>{" "}
				and an{" "}
				<strong className="text-foreground">agent-facing MCP server</strong>.
				A brand is a folder on your machine, a style guide and a set of logos
				and title cards. Select one and every project, export, and agent edit
				belongs to it. Projects and brands live in Postgres; media and style
				guides live on disk, so anything editing them, Obsidian, Finder, git,
				or an agent, reads the same files.
			</p>

			<div className="mt-10 overflow-hidden rounded-2xl border">
				<Table>
					<TableBody>
						{STACK.map((row) => (
							<TableRow key={row.layer}>
								<TableCell className="text-foreground w-40 font-medium">
									{row.layer}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{row.tech}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</section>
	);
}
