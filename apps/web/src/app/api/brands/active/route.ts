import { getActiveBrand, selectBrand, setActiveBrandId } from "@/brands/server/queries";
import { brandError, notFound } from "@/brands/server/respond";

export const dynamic = "force-dynamic";

/** The brand every new project, render and workflow belongs to. */
export async function GET() {
	try {
		return Response.json(await getActiveBrand());
	} catch (error) {
		return brandError(error);
	}
}

export async function PUT(request: Request) {
	try {
		const { id } = await request.json();
		if (id === null) {
			await setActiveBrandId({ id: null });
			return Response.json(null);
		}
		if (typeof id !== "string") {
			return Response.json({ error: "Expected a brand id or null" }, { status: 400 });
		}
		const brand = await selectBrand({ id });
		return brand ? Response.json(brand) : notFound();
	} catch (error) {
		return brandError(error);
	}
}
