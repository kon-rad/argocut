"use client";

import { Fraunces, JetBrains_Mono } from "next/font/google";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "../ui/button";
import { SOCIAL_LINKS } from "@/site/social";

const fraunces = Fraunces({
	subsets: ["latin"],
	weight: ["500"],
	style: ["normal", "italic"],
});

const mono = JetBrains_Mono({
	subsets: ["latin"],
	weight: ["400", "500"],
});

const RULER = ["00:00", "00:12", "00:24", "00:36", "00:48"];

const OPS = [
	{ label: "create_project", left: "3%" },
	{ label: "import_media", left: "22%" },
	{ label: "apply_edits", left: "50%" },
	{ label: "hand_off", left: "86%" },
];

type Segment = {
	author: "agent" | "you";
	label: string;
	grow: number;
};

const SEGMENTS: Segment[] = [
	{ author: "agent", label: "assembled cut", grow: 3 },
	{ author: "agent", label: "titles + audio", grow: 2 },
	{ author: "you", label: "final trim", grow: 1 },
];

export function Hero() {
	const reduceMotion = useReducedMotion();
	const rise = (delay: number) => ({
		initial: reduceMotion ? undefined : { opacity: 0, y: 14 },
		animate: { opacity: 1, y: 0 },
		transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const },
	});

	return (
		<div className="bg-[#15120d] text-[#f3ecdd]">
			<div className="mx-auto flex min-h-[calc(100svh-4.5rem)] w-full max-w-4xl flex-col justify-center gap-14 px-6 py-20">
				<div>
					<motion.p
						{...rise(0)}
						className={`${mono.className} text-[11px] tracking-[0.25em] text-[#f5c842] uppercase`}
					>
						An open source video editor
					</motion.p>

					<motion.h1
						{...rise(0.08)}
						className={`${fraunces.className} mt-5 text-[2.75rem] leading-[1.05] tracking-tight sm:text-[3.75rem]`}
					>
						Cut it yourself.
						<br />
						<span className="text-[#f5c842] italic">
							Or hand it to your agent.
						</span>
					</motion.h1>

					<motion.p
						{...rise(0.16)}
						className="mt-7 max-w-xl text-base leading-relaxed text-[#c9beac] sm:text-lg"
					>
						Brand-scoped editing in your browser. Point Claude Code, Codex, or
						Hermes at the same timeline through an MCP server, every edit
						lands in the same undo stack as yours.
					</motion.p>

					<motion.div {...rise(0.24)} className="mt-9 flex flex-wrap gap-4">
						<Link href="/projects">
							<Button
								size="lg"
								className="h-11 bg-[#f5c842] text-base text-[#15120d] hover:bg-[#f5c842]/90"
							>
								Try early beta
								<ArrowRight className="ml-0.5 size-4" />
							</Button>
						</Link>
						<Link
							href={SOCIAL_LINKS.github}
							target="_blank"
							rel="noopener noreferrer"
						>
							<Button
								size="lg"
								variant="outline"
								className="h-11 border-[#f3ecdd]/25 bg-transparent text-base text-[#f3ecdd] hover:bg-[#f3ecdd]/10"
							>
								View on GitHub
								<ArrowUpRight className="ml-0.5 size-4" />
							</Button>
						</Link>
					</motion.div>
				</div>

				<motion.div {...rise(0.34)}>
					<TimelineStrip reduceMotion={Boolean(reduceMotion)} />
				</motion.div>
			</div>
		</div>
	);
}

function TimelineStrip({ reduceMotion }: { reduceMotion: boolean }) {
	return (
		<div className="relative rounded-xl border border-[#f3ecdd]/15 bg-[#f3ecdd]/[0.03] p-5 sm:p-6">
			<div className="overflow-x-auto">
				<div className="min-w-[560px]">
					<TimelineTrack reduceMotion={reduceMotion} />
				</div>
			</div>
			<div className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-xl bg-gradient-to-l from-[#15120d] to-transparent sm:hidden" />
		</div>
	);
}

function TimelineTrack({ reduceMotion }: { reduceMotion: boolean }) {
	return (
		<>
			<div
				className={`${mono.className} flex justify-between text-[10px] tracking-wide text-[#c9beac]/70`}
			>
				{RULER.map((t) => (
					<span key={t}>{t}</span>
				))}
			</div>
			<div className="mt-2 h-px w-full bg-[#f3ecdd]/10" />

			<div className="relative mt-5 h-4">
				{OPS.map((op, index) => (
					<motion.div
						key={op.label}
						initial={reduceMotion ? undefined : { opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.4, delay: reduceMotion ? 0 : 0.6 + index * 0.15 }}
						className="absolute top-0 flex flex-col items-start"
						style={{ left: op.left }}
					>
						<span
							className={`${mono.className} whitespace-nowrap text-[10px] text-[#f5c842]`}
						>
							{op.label}
						</span>
						<span className="mt-1 h-2 w-px bg-[#f5c842]/50" />
					</motion.div>
				))}
			</div>

			<div className="mt-1 flex h-11 gap-1.5 overflow-hidden rounded-md">
				<motion.div
					initial={reduceMotion ? undefined : { flexGrow: 0 }}
					animate={{ flexGrow: 0.6 }}
					transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.5 }}
					className="flex items-center justify-center rounded-md border border-dashed border-[#f3ecdd]/30"
				>
					<span
						className={`${mono.className} px-2 text-[9px] whitespace-nowrap text-[#c9beac]`}
					>
						your footage
					</span>
				</motion.div>

				{SEGMENTS.map((seg, index) => (
					<motion.div
						key={seg.label}
						initial={reduceMotion ? undefined : { flexGrow: 0 }}
						animate={{ flexGrow: seg.grow }}
						transition={{
							duration: 0.5,
							delay: reduceMotion ? 0 : 0.7 + index * 0.15,
							ease: [0.16, 1, 0.3, 1],
						}}
						className={
							seg.author === "agent"
								? "flex items-center justify-center rounded-md bg-[#f5c842]"
								: "flex items-center justify-center rounded-md border border-[#f3ecdd]/40"
						}
					>
						<span
							className={`${mono.className} truncate px-2 text-[10px] whitespace-nowrap ${
								seg.author === "agent" ? "text-[#15120d]" : "text-[#f3ecdd]"
							}`}
						>
							{seg.label}
						</span>
					</motion.div>
				))}
			</div>

			<div
				className={`${mono.className} mt-3 flex justify-between text-[10px] text-[#c9beac]/60`}
			>
				<span>you drop in the folder</span>
				<span>you get a link back, still fully editable</span>
			</div>
		</>
	);
}
