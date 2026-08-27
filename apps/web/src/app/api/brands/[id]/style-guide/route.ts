import {
	readBrandStyleGuide,
	saveBrandStyleGuide,
} from "@/brands/server/queries";
import { brandError, notFound } from "@/brands/server/respond";

export const dynamic = "force-dynamic";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const guide = await readBrandStyleGuide({ id: (await params).id });
		return guide ? Response.json(guide) : notFound();
	} catch (error) {
		return brandError(error);
	}
}

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const { content } = await request.json();
		if (typeof content !== "string") {
			return Response.json(
				{ error: "Style guide content must be a string" },
				{ status: 400 },
			);
		}
		const brand = await saveBrandStyleGuide({
			id: (await params).id,
			content,
		});
		return brand ? Response.json(brand) : notFound();
	} catch (error) {
		return brandError(error);
	}
}
