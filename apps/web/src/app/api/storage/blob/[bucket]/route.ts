import { clearBlobs, listBlobs } from "@/services/storage/server/file-store";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ bucket: string }> },
) {
	const { bucket } = await params;
	try {
		return Response.json(await listBlobs({ bucket }));
	} catch (error) {
		return Response.json({ error: String(error) }, { status: 400 });
	}
}

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ bucket: string }> },
) {
	const { bucket } = await params;
	try {
		await clearBlobs({ bucket });
		return new Response(null, { status: 204 });
	} catch (error) {
		return Response.json({ error: String(error) }, { status: 400 });
	}
}
