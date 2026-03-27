import AppLayout from "@/components/app-layout";
import { getProducts } from "@/lib/data";
import InventoryClient from "./inventory-client";
import { Timestamp } from 'firebase/firestore';  // For Timestamp check

export default async function InventoryPage() {
    const rawProducts = await getProducts();  // Fetch raw data

    // Convert Timestamps to ISO strings (fixes serialization error)
    const products = rawProducts.map(product => ({
        ...product,
        createdAt: product.createdAt instanceof Timestamp 
            ? product.createdAt.toDate().toISOString() 
            : product.createdAt || new Date().toISOString(),
        updatedAt: product.updatedAt instanceof Timestamp 
            ? product.updatedAt.toDate().toISOString() 
            : product.updatedAt || new Date().toISOString(),
    }));

    return (
        <AppLayout>
            <InventoryClient products={products} />
        </AppLayout>
    );
}