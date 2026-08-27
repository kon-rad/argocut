import { create } from "zustand";
import type {
	BrandWithStatus,
	CreateBrandInput,
	ImportBrandInput,
	UpdateBrandInput,
} from "./types";

/**
 * The selected brand is the context everything else is created inside.
 *
 * It is held on the server rather than in `localStorage` so that the agent, the
 * MCP server and a second browser window all agree on which brand is active —
 * a per-profile selection would recreate exactly the problem server storage was
 * built to remove.
 */

async function request<T>(
	url: string,
	init?: RequestInit & { json?: unknown },
): Promise<T> {
	const { json, ...rest } = init ?? {};
	const response = await fetch(url, {
		...rest,
		...(json !== undefined
			? {
					body: JSON.stringify(json),
					headers: { "Content-Type": "application/json", ...rest.headers },
				}
			: {}),
	});

	if (!response.ok) {
		let message = response.statusText;
		try {
			const body = await response.json();
			if (body?.error) message = String(body.error);
		} catch {
			// A non-JSON error body is not worth a second failure.
		}
		throw new Error(message);
	}

	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

interface BrandsState {
	brands: BrandWithStatus[];
	activeBrandId: string | null;
	isLoading: boolean;
	isReady: boolean;
	error: string | null;

	load: () => Promise<void>;
	createBrand: (args: { input: CreateBrandInput }) => Promise<BrandWithStatus>;
	importBrand: (args: { input: ImportBrandInput }) => Promise<BrandWithStatus>;
	updateBrand: (args: {
		id: string;
		input: UpdateBrandInput;
	}) => Promise<BrandWithStatus>;
	deleteBrand: (args: { id: string }) => Promise<void>;
	selectBrand: (args: { id: string | null }) => Promise<void>;
	rescanBrand: (args: { id: string }) => Promise<BrandWithStatus>;
	saveStyleGuide: (args: {
		id: string;
		content: string;
	}) => Promise<BrandWithStatus>;
}

function replace({
	brands,
	updated,
}: {
	brands: BrandWithStatus[];
	updated: BrandWithStatus;
}): BrandWithStatus[] {
	const without = brands.filter((brand) => brand.id !== updated.id);
	return [...without, updated].sort((a, b) => a.name.localeCompare(b.name));
}

export const useBrandsStore = create<BrandsState>()((set, get) => ({
	brands: [],
	activeBrandId: null,
	isLoading: false,
	isReady: false,
	error: null,

	load: async () => {
		set({ isLoading: true, error: null });
		try {
			const [brands, active] = await Promise.all([
				request<BrandWithStatus[]>("/api/brands"),
				request<BrandWithStatus | null>("/api/brands/active"),
			]);
			set({
				brands,
				activeBrandId: active?.id ?? null,
				isLoading: false,
				isReady: true,
			});
		} catch (error) {
			set({
				isLoading: false,
				isReady: true,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	},

	createBrand: async ({ input }) => {
		const brand = await request<BrandWithStatus>("/api/brands", {
			method: "POST",
			json: input,
		});
		set({ brands: replace({ brands: get().brands, updated: brand }) });
		// A brand you just made is the one you meant to work in.
		await get().selectBrand({ id: brand.id });
		return brand;
	},

	importBrand: async ({ input }) => {
		const brand = await request<BrandWithStatus>("/api/brands/import", {
			method: "POST",
			json: input,
		});
		set({ brands: replace({ brands: get().brands, updated: brand }) });
		await get().selectBrand({ id: brand.id });
		return brand;
	},

	updateBrand: async ({ id, input }) => {
		const brand = await request<BrandWithStatus>(`/api/brands/${id}`, {
			method: "PATCH",
			json: input,
		});
		set({ brands: replace({ brands: get().brands, updated: brand }) });
		return brand;
	},

	deleteBrand: async ({ id }) => {
		await request<void>(`/api/brands/${id}`, { method: "DELETE" });
		set((state) => ({
			brands: state.brands.filter((brand) => brand.id !== id),
			activeBrandId: state.activeBrandId === id ? null : state.activeBrandId,
		}));
	},

	selectBrand: async ({ id }) => {
		const brand = await request<BrandWithStatus | null>("/api/brands/active", {
			method: "PUT",
			json: { id },
		});
		set((state) => ({
			activeBrandId: brand?.id ?? null,
			brands: brand ? replace({ brands: state.brands, updated: brand }) : state.brands,
		}));
	},

	rescanBrand: async ({ id }) => {
		const brand = await request<BrandWithStatus>(`/api/brands/${id}/rescan`, {
			method: "POST",
		});
		set({ brands: replace({ brands: get().brands, updated: brand }) });
		return brand;
	},

	saveStyleGuide: async ({ id, content }) => {
		const brand = await request<BrandWithStatus>(
			`/api/brands/${id}/style-guide`,
			{ method: "PUT", json: { content } },
		);
		set({ brands: replace({ brands: get().brands, updated: brand }) });
		return brand;
	},
}));

/** The active brand object, or null. */
export function useActiveBrand(): BrandWithStatus | null {
	return useBrandsStore(
		(state) =>
			state.brands.find((brand) => brand.id === state.activeBrandId) ?? null,
	);
}
