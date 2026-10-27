import { notFound } from "next/navigation";
import { getPublicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { FALLBACK_DEMO_PRODUCTS } from "@/lib/demo-products";
import { ProductForm } from "../../product-form";

interface EditProductPageProps {
  params: Promise<{
    id: string;
  }>;
}

export const metadata = {
  title: "Edit Hardware SKU | RoboForge Admin",
};

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;
  const publicEnv = getPublicEnv();
  const isPlaceholderDb = publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  let initialData: {
    id: string;
    name: string;
    slug: string;
    description: string;
    price_paise: number;
    image_url: string;
    hsn_code: string;
    tax_rate_bps: number;
    is_active: boolean;
    stock_on_hand: number;
    stock_reserved?: number;
  } | null = null;

  if (isPlaceholderDb) {
    const demo = FALLBACK_DEMO_PRODUCTS.find((p) => p.id === id);
    if (demo) {
      initialData = {
        id: demo.id,
        name: demo.name,
        slug: demo.slug,
        description: demo.description,
        price_paise: demo.price_paise,
        image_url: demo.image_url,
        hsn_code: demo.hsn_code,
        tax_rate_bps: demo.tax_rate_bps,
        is_active: demo.is_active,
        stock_on_hand: demo.available_quantity + 2,
        stock_reserved: 2,
      };
    }
  } else {
    try {
      const admin = createAdminClient();
      const { data: prod, error } = await admin
        .from("products")
        .select("*, inventory(stock_on_hand, stock_reserved)")
        .eq("id", id)
        .maybeSingle();

      if (!error && prod) {
        // Supabase returns 1-to-1 relations as single object or array depending on schema
        const inv = Array.isArray(prod.inventory) ? prod.inventory[0] : prod.inventory;

        initialData = {
          id: prod.id,
          name: prod.name,
          slug: prod.slug,
          description: prod.description || "",
          price_paise: Number(prod.price_paise),
          image_url: prod.image_url || "",
          hsn_code: prod.hsn_code,
          tax_rate_bps: Number(prod.tax_rate_bps),
          is_active: prod.is_active,
          stock_on_hand: inv?.stock_on_hand || 0,
          stock_reserved: inv?.stock_reserved || 0,
        };
      }
    } catch (err) {
      console.error("Failed to fetch product for edit:", err);
    }
  }

  if (!initialData) {
    notFound();
  }

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Edit Hardware SKU
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Update specifications, adjust pricing, or reconcile physical warehouse stock.
        </p>
      </div>

      <ProductForm initialData={initialData} isEdit={true} />
    </div>
  );
}
