import type { ProductCatalogItem } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env";
import { FALLBACK_DEMO_PRODUCTS } from "./demo-products";

export { FALLBACK_DEMO_PRODUCTS };

/**
 * Fetches active catalog products with computed stock availability.
 */
export async function getCatalogProducts(): Promise<ProductCatalogItem[]> {
  const env = getPublicEnv();
  if (env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")) {
    return FALLBACK_DEMO_PRODUCTS;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products_catalog")
      .select("*")
      .order("price_paise", { ascending: false });

    if (!error && data) {
      return data.map((item) => ({
        ...item,
        metadata: (item.metadata as Record<string, unknown>) || {},
      }));
    }
  } catch (err) {
    console.warn("Could not query Supabase products_catalog:", err);
  }

  return [];
}

/**
 * Fetches a single product by slug with live stock status.
 */
export async function getProductBySlug(slug: string): Promise<ProductCatalogItem | null> {
  const env = getPublicEnv();
  if (env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")) {
    return FALLBACK_DEMO_PRODUCTS.find((p) => p.slug === slug) || null;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products_catalog")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (!error) {
      if (!data) return null;
      return {
        ...data,
        metadata: (data.metadata as Record<string, unknown>) || {},
      };
    }
  } catch (err) {
    console.warn(`Could not query product ${slug} from Supabase:`, err);
  }

  return null;
}

/**
 * Fetches a product by its unique UUID.
 */
export async function getProductById(id: string): Promise<ProductCatalogItem | null> {
  const env = getPublicEnv();
  if (env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")) {
    return FALLBACK_DEMO_PRODUCTS.find((p) => p.id === id) || null;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products_catalog")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!error) {
      if (!data) return null;
      return {
        ...data,
        metadata: (data.metadata as Record<string, unknown>) || {},
      };
    }
  } catch (err) {
    console.warn(`Could not query product ${id} from Supabase:`, err);
  }

  return null;
}
