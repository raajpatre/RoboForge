import { ProductForm } from "../product-form";

export const metadata = {
  title: "New Hardware SKU | RoboForge Admin",
};

export default function NewProductPage() {
  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Create New Hardware SKU
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Add a new industrial robotics product, configure HSN classification, and allocate warehouse inventory.
        </p>
      </div>

      <ProductForm isEdit={false} />
    </div>
  );
}
