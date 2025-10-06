
import AppLayout from "@/components/app-layout";
import { getCustomers, getOrders } from "@/lib/data";
import { InvoicesClient } from './invoices-client-final'; // Use the new file name
export default async function InvoicesPage() {
    const customers = await getCustomers();
    const orders = await getOrders();

    return (
        <AppLayout>
            <InvoicesClient orders={orders} customers={customers} />
        </AppLayout>
    );
}
