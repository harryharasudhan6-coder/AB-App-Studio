import AppLayout from "@/components/app-layout";
import { getProducts } from "@/lib/data";
import InventoryClient from "./inventory-client";
import { Timestamp } from 'firebase/firestore';  // For Timestamp check

export default async function InventoryPage() {
    const rawProducts = await getProducts();  // Fetch raw data

    // Convert Timestamps to ISO strings (fixes serialization error)
    const products = rawProducts.map(product => ({
        ...product,
        createdAt: (product.createdAt as any) instanceof Timestamp
			? (product.createdAt as any).toDate().toISOString()
			: product.createdAt || new Date().toISOString(),
		updatedAt: (product.updatedAt as any) instanceof Timestamp 
            ? (product.updatedAt as any).toDate().toISOString() 
            : product.updatedAt || new Date().toISOString(),
    }));

    return (
        <AppLayout>
            <InventoryClient products={products} />
        </AppLayout>
    );
}