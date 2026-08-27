import { rescanBrand } from "@/brands/server/queries";
import { brandError, notFound } from "@/brands/server/respond";

export const dynamic = "force-dynamic";

export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const brand = await rescanBrand({ id: (await params).id });
		return brand ? Response.json(brand) : notFound();
	} catch (error) {
		return brandError(error);
	}
}
