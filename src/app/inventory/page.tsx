
import AppLayout from "@/components/app-layout";
import { getProducts } from "@/lib/data";
import InventoryClient from "./inventory-client";

export default async function InventoryPage() {
    const products = await getProducts();
    return (
        <AppLayout>
            <InventoryClient products={products} />
        </AppLayout>
    );
}
