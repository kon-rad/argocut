import { getDoc, removeDoc, setDoc } from "@/services/storage/server/file-store";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ collection: string; key: string }> },
) {
	const { collection, key } = await params;
	try {
		const value = await getDoc({ collection, key: decodeURIComponent(key) });
		if (value === null) {
			return new Response(null, { status: 404 });
		}
		return Response.json(value);
	} catch (error) {
		return Response.json({ error: String(error) }, { status: 400 });
	}
}

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ collection: string; key: string }> },
) {
	const { collection, key } = await params;
	try {
		await setDoc({
			collection,
			key: decodeURIComponent(key),
			value: await request.json(),
		});
		return new Response(null, { status: 204 });
	} catch (error) {
		return Response.json({ error: String(error) }, { status: 400 });
	}
}

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ collection: string; key: string }> },
) {
	const { collection, key } = await params;
	try {
		await removeDoc({ collection, key: decodeURIComponent(key) });
		return new Response(null, { status: 204 });
	} catch (error) {
		return Response.json({ error: String(error) }, { status: 400 });
	}
}
