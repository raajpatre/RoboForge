"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createProductAction, updateProductAction } from "@/app/actions/admin";
import { rupeesToPaise, paiseToRupees } from "@/lib/domain/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, AlertCircle, Package, AlertTriangle, Link2 } from "lucide-react";
import { CloudinaryImageUpload } from "@/components/admin/cloudinary-image-upload";

interface ProductFormProps {
  initialData?: {
    id?: string;
    name: string;
    slug: string;
    sku?: string;
    category?: string;
    description: string;
    price_paise: number;
    image_url: string;
    hsn_code: string;
    tax_rate_bps: number;
    is_active: boolean;
    stock_on_hand: number;
    stock_reserved?: number;
  };
  isEdit?: boolean;
}

export function ProductForm({ initialData, isEdit = false }: ProductFormProps) {
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    slug: initialData?.slug || "",
    sku: initialData?.sku || (initialData?.slug ? UPPER_SNAKE(initialData.slug) : ""),
    category: initialData?.category || "manipulators",
    description: initialData?.description || "",
    priceRupees: initialData ? String(paiseToRupees(initialData.price_paise)) : "15000",
    image_url: initialData?.image_url || "",
    hsn_code: initialData?.hsn_code || "84795000",
    tax_rate_bps: initialData?.tax_rate_bps || 1800,
    is_active: initialData ? initialData.is_active : true,
    stock_on_hand: initialData ? String(initialData.stock_on_hand) : "10",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  function slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function UPPER_SNAKE(str: string): string {
    return str.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  }

  // Auto-generate slug and SKU from title
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    const slug = isEdit && initialData?.slug ? initialData.slug : slugify(name);
    const sku = isEdit && initialData?.sku ? initialData.sku : (UPPER_SNAKE(slug) || "ROBO_ITEM");
    setFormData((prev) => ({
      ...prev,
      name,
      slug,
      sku,
    }));
  };

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // If editing and stock or availability is altered, require confirmation
    if (isEdit && initialData) {
      const stockChanged = parseInt(formData.stock_on_hand, 10) !== initialData.stock_on_hand;
      const availabilityChanged = formData.is_active !== initialData.is_active;

      if (stockChanged || availabilityChanged) {
        setShowConfirmModal(true);
        return;
      }
    }

    executeSave();
  };

  const executeSave = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setShowConfirmModal(false);

    const priceRupeesNum = parseFloat(formData.priceRupees);
    if (isNaN(priceRupeesNum) || priceRupeesNum < 0) {
      setErrorMessage("Please enter a valid non-negative price in Rupees.");
      setIsLoading(false);
      return;
    }

    const stockNum = parseInt(formData.stock_on_hand, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      setErrorMessage("Stock on hand must be a non-negative integer.");
      setIsLoading(false);
      return;
    }

    const autoSlug = formData.slug.trim() || slugify(formData.name.trim()) || `product-${Date.now()}`;
    let autoSku = formData.sku.trim() || UPPER_SNAKE(autoSlug) || `SKU_${Date.now()}`;
    if (autoSku.length < 3) {
      autoSku = `ROBO_${autoSku}`;
    }

    const payload = {
      name: formData.name.trim(),
      slug: autoSlug,
      sku: autoSku,
      category: formData.category || "robotics",
      description: formData.description.trim(),
      price_paise: rupeesToPaise(priceRupeesNum),
      image_url: formData.image_url.trim(),
      hsn_code: formData.hsn_code.trim() || "84795000",
      tax_rate_bps: Number(formData.tax_rate_bps),
      is_active: formData.is_active,
      stock_on_hand: stockNum,
      metadata: {},
    };

    try {
      if (isEdit && initialData?.id) {
        const res = await updateProductAction(initialData.id, payload);
        if (res.success) {
          router.push("/admin/products");
          router.refresh();
        } else {
          setErrorMessage(res.error || "Failed to update product.");
        }
      } else {
        const res = await createProductAction(payload);
        if (res.success) {
          router.push("/admin/products");
          router.refresh();
        } else {
          setErrorMessage(res.error || "Failed to create product.");
        }
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected server error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={handlePreSubmit} className="space-y-8 max-w-3xl">
        {/* Top Bar */}
        <div className="flex items-center justify-between pb-6 border-b border-border/60">
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to Products</span>
          </Link>

          <Button
            type="submit"
            disabled={isLoading}
            className="font-mono text-xs gap-1.5 cursor-pointer"
          >
            {isLoading ? (
              <>
                <div className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                <span>Saving SKU...</span>
              </>
            ) : (
              <>
                <Save className="size-3.5" />
                <span>{isEdit ? "Update Hardware SKU" : "Publish Hardware SKU"}</span>
              </>
            )}
          </Button>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive flex items-start gap-2.5 text-xs">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Main Details Card */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 space-y-6 shadow-sm">
          <h2 className="font-heading text-base font-bold text-foreground flex items-center gap-2">
            <Package className="size-4 text-primary" />
            General Hardware Specifications
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-foreground mb-1">
                Product Title *
              </label>
              <Input
                type="text"
                value={formData.name}
                onChange={handleNameChange}
                placeholder="e.g. ForgeBot Alpha 6-DOF Robotic Arm"
                required
                className="h-10 text-xs"
              />
            </div>



            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-foreground mb-1">
                Technical Description
              </label>
              <textarea
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Engineering specs, degree of freedom, payload, interface protocols..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <label className="block text-xs font-medium text-foreground">
                Product Image
              </label>
              {/* Cloudinary drag-and-drop uploader */}
              <CloudinaryImageUpload
                value={formData.image_url}
                onChange={(url) => setFormData({ ...formData, image_url: url })}
              />
              {/* Manual URL fallback (for external images / Cloudinary not configured) */}
              <div className="flex items-center gap-2 pt-1">
                <Link2 className="size-3.5 text-muted-foreground shrink-0" />
                <Input
                  type="url"
                  value={formData.image_url}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  placeholder="Or paste an image URL (https://...)"
                  className="h-8 text-xs font-mono flex-1"
                />
              </div>
              <p className="text-[11px] text-muted-foreground font-mono">
                Upload via Cloudinary above, or paste any HTTPS image URL below.
              </p>
            </div>
          </div>
        </div>

        {/* Pricing Card */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 space-y-6 shadow-sm">
          <h2 className="font-heading text-base font-bold text-foreground">
            Financial Configuration
          </h2>

          <div className="max-w-md">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Base Price in INR *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground">
                  INR
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.priceRupees}
                  onChange={(e) => setFormData({ ...formData, priceRupees: e.target.value })}
                  className="pl-12 h-10 text-xs font-mono"
                  required
                />
              </div>
              <p className="text-[11px] font-mono text-muted-foreground mt-1">
                Integer representation: {rupeesToPaise(parseFloat(formData.priceRupees) || 0)} paise
              </p>
            </div>
          </div>
        </div>

        {/* Inventory Control Card */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 space-y-6 shadow-sm">
          <h2 className="font-heading text-base font-bold text-foreground">
            Warehouse Inventory Levels
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Stock On Hand (Physical Count) *
              </label>
              <Input
                type="number"
                min="0"
                step="1"
                value={formData.stock_on_hand}
                onChange={(e) => setFormData({ ...formData, stock_on_hand: e.target.value })}
                className="h-10 text-xs font-mono font-bold"
                required
              />
            </div>

            {isEdit && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Active Checkout Reservations
                </label>
                <div className="h-10 flex items-center px-3 rounded-md bg-muted/40 border border-border/60 text-xs font-mono font-bold text-amber-500">
                  {initialData?.stock_reserved || 0} units held in 15-min cart holds
                </div>
              </div>
            )}

            <div className="sm:col-span-2 pt-2">
              <div className={`p-4 rounded-xl border transition-colors ${
                formData.is_active 
                  ? "bg-emerald-500/10 border-emerald-500/30" 
                  : "bg-muted/40 border-border"
              }`}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="size-4 mt-0.5 rounded border-border text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="text-xs font-semibold text-foreground block">
                      {formData.is_active ? "● Active — Visible on Public Store" : "○ Inactive — Hidden Draft"}
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formData.is_active 
                        ? "This hardware item will be immediately visible in the public catalog and available for purchase." 
                        : "This item is saved as an internal draft and hidden from the public storefront."}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Confirmation Modal for Availability & Stock Changes */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-amber-500/10 p-2 text-amber-500 shrink-0">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <h3 className="font-heading text-base font-bold text-foreground">
                  Confirm Stock / Availability Update
                </h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  You are making changes that directly impact customer purchasing ability:
                </p>
                <ul className="mt-2 text-xs font-mono space-y-1 text-foreground/90">
                  {initialData && formData.is_active !== initialData.is_active && (
                    <li>
                      • Catalog Visibility:{" "}
                      <strong>{formData.is_active ? "Activating product" : "Deactivating product (hiding from store)"}</strong>
                    </li>
                  )}
                  {initialData && parseInt(formData.stock_on_hand, 10) !== initialData.stock_on_hand && (
                    <li>
                      • Warehouse Stock: {initialData.stock_on_hand} →{" "}
                      <strong>{formData.stock_on_hand} units</strong>
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmModal(false)}
                className="font-mono text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={executeSave}
                disabled={isLoading}
                className="font-mono text-xs bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isLoading ? "Updating..." : "Confirm & Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
