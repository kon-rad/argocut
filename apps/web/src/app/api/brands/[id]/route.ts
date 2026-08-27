import { deleteBrand, getBrand, updateBrand } from "@/brands/server/queries";
import { brandError, notFound } from "@/brands/server/respond";

export const dynamic = "force-dynamic";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const brand = await getBrand({ id: (await params).id });
		return brand ? Response.json(brand) : notFound();
	} catch (error) {
		return brandError(error);
	}
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const brand = await updateBrand({
			id: (await params).id,
			input: await request.json(),
		});
		return brand ? Response.json(brand) : notFound();
	} catch (error) {
		return brandError(error);
	}
}

/** Forgets the brand. The folder on disk is left exactly as it was. */
export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const removed = await deleteBrand({ id: (await params).id });
		return removed ? new Response(null, { status: 204 }) : notFound();
	} catch (error) {
		return brandError(error);
	}
}
