import {
	clearDocs,
	getAllDocs,
	listDocs,
} from "@/services/storage/server/file-store";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ collection: string }> },
) {
	const { collection } = await params;
	const wantValues =
		new URL(request.url).searchParams.get("values") === "1";
	try {
		return Response.json(
			wantValues
				? await getAllDocs({ collection })
				: await listDocs({ collection }),
		);
	} catch (error) {
		return Response.json({ error: String(error) }, { status: 400 });
	}
}

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ collection: string }> },
) {
	const { collection } = await params;
	try {
		await clearDocs({ collection });
		return new Response(null, { status: 204 });
	} catch (error) {
		return Response.json({ error: String(error) }, { status: 400 });
	}
}
