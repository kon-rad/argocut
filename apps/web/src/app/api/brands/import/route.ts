import { importBrand } from "@/brands/server/queries";
import { brandError } from "@/brands/server/respond";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	try {
		const input = await request.json();
		return Response.json(await importBrand({ input }), { status: 201 });
	} catch (error) {
		return brandError(error);
	}
}
