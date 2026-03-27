import AppLayout from "@/components/app-layout";
import { getCoreOrderData, getProducts } from "@/lib/data";
import { OrdersClient } from "./orders-client";

// Generic converter: makes any object fully serializable
function toPlain(value: any): any {
  // Arrays -> convert each element
  if (Array.isArray(value)) {
    return value.map((v) => toPlain(v));
  }

  if (value && typeof value === "object") {
    // Firestore Timestamp instance (has toDate)
    if (typeof (value as any).toDate === "function") {
      try {
        return (value as any).toDate().toISOString();
      } catch {
        // Fallback if toDate fails
        return String(value);
      }
    }

    // Firestore Timestamp plain shape { seconds, nanoseconds }
    if (
      "seconds" in value &&
      typeof (value as any).seconds === "number" &&
      "nanoseconds" in value &&
      typeof (value as any).nanoseconds === "number"
    ) {
      const ms =
        (value as any).seconds * 1000 +
        Math.floor((value as any).nanoseconds / 1e6);
      return new Date(ms).toISOString();
    }

    // Regular object -> recurse
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toPlain(v);
    }
    return out;
  }

  // primitives
  return value;
}

export default async function OrdersPage() {
  // Fetch server-side
  const { orders: rawOrders, customers: rawCustomers } = await getCoreOrderData();
  const rawProducts = await getProducts();

  // Convert orders/customers to plain serializable objects
  const orders = (rawOrders || []).map((o: any) => toPlain(o));
  const customers = (rawCustomers || []).map((c: any) => toPlain(c));

  // Products may be DocumentSnapshots or plain objects; handle both
  const products = (rawProducts || []).map((p: any) => {
    const data = typeof p?.data === "function" ? p.data() : p;
    const id = p?.id || data?.id;
    const converted = toPlain(data || {});
    if (id) converted.id = id;
    return converted;
  });

  return (
    <AppLayout>
      <OrdersClient orders={orders} customers={customers} products={products} />
    </AppLayout>
  );
}