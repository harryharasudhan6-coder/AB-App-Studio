// @/lib/data.ts – Complete Merged File (Your Original + Real-Time Listeners & Enhancements)
// All your custom logic preserved; added timestamps for sorting/sync, listeners for global real-time updates.
import { db } from './firebase';
import {
    collection,
    getDocs,
    addDoc,
    doc,
    setDoc,
    deleteDoc,
    writeBatch,
    getDoc,
    query,
    limit,
    runTransaction,
    DocumentReference,
    updateDoc,
    increment,
    where,
    orderBy,
    Transaction,
    onSnapshot // NEW: For real-time listeners
} from 'firebase/firestore';
import type {
    Customer,
    Product,
    Order,
    Payment,
    OrderItem,
    PaymentAlert,
    LowStockAlert,
    Supplier,
    Purchase,
    PurchasePayment,
    OrderStatus,
    PaymentMode,
    CalculationType,
    PurchasePaymentTerm
} from './types';
import { differenceInDays, addDays, startOfToday, subMonths } from 'date-fns';

// =============================================================================
// YOUR ORIGINAL CORE FUNCTIONS (Unchanged, with Minor Enhancements for Timestamps)
// =============================================================================
export async function getCoreOrderData() {
    const customersPromise = getCustomers();
    const productsPromise = getProducts();
    const ordersPromise = getOrders();
    const [customers, products, orders] = await Promise.all([
        customersPromise,
        productsPromise,
        ordersPromise
    ]);
    return { customers, products, orders };
}

// CUSTOMER FUNCTIONS
export const getCustomers = async (): Promise<Customer[]> => {
    try {
        const snapshot = await getDocs(query(collection(db, 'customers'), orderBy('name')));
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Customer));
    } catch (error) {
        console.error("Error fetching customers: ", error);
        return [];
    }
};

export const getCustomerById = async (id: string): Promise<Customer | null> => {
    try {
        const docRef = doc(db, 'customers', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as Customer;
        }
        return null;
    } catch (error) {
        console.error("Error fetching customer by ID: ", error);
        return null;
    }
};

export const getCustomerBalance = async (customerId: string): Promise<number> => {
    if (!customerId) return 0;
    try {
        const ordersQuery = query(
            collection(db, 'orders'),
            where('customerId', '==', customerId)
        );
        const snapshot = await getDocs(ordersQuery);
        if (snapshot.empty) return 0;

        let orders = snapshot.docs.map(doc => doc.data() as Order);
        orders.sort((a, b) => {
            const dateA = a.orderDate ? new Date(a.orderDate).getTime() : 0;
            const dateB = b.orderDate ? new Date(b.orderDate).getTime() : 0;
            if (isNaN(dateA)) return -1;
            if (isNaN(dateB)) return 1;
            return dateA - dateB;
        });

        const latestOrder = orders[orders.length - 1];
        return latestOrder.isOpeningBalance ? (latestOrder.balanceDue ?? 0) : (latestOrder.balanceDue ?? 0);
    } catch (error) {
        console.error(`Error fetching balance for customer ${customerId}:`, error);
        return 0;
    }
};

export const addCustomer = async (customerData: Omit<Customer, 'id' | 'transactionHistory' | 'orders'>): Promise<Customer> => {
    const now = new Date().toISOString();
    const newCustomer: Omit<Customer, 'id'> = {
        ...customerData,
        transactionHistory: { totalSpent: 0, lastPurchaseDate: now.split('T')[0] },
        createdAt: now,
        updatedAt: now
    };
    const docRef = await addDoc(collection(db, 'customers'), newCustomer);
    return { id: docRef.id, ...newCustomer, orders: [] };
};

export const updateCustomer = async (customerData: Partial<Customer>): Promise<void> => {
    const { id, ...dataToUpdate } = customerData;
    if (!id) throw new Error("Customer ID is required to update.");
    const updatesWithTimestamp = {
        ...dataToUpdate,
        updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'customers', id), updatesWithTimestamp, { merge: true });
};

export const deleteCustomer = async (id: string) => {
    await deleteDoc(doc(db, 'customers', id));
};

// PRODUCT FUNCTIONS
export const getProducts = async (): Promise<Product[]> => {
    try {
        const snapshot = await getDocs(collection(db, 'products'));
        let data = snapshot.docs.map(doc => {
            const rawData = doc.data();
            const fallbackDate = rawData.createdAt || new Date('2024-01-01T00:00:00Z').toISOString();
            return {
                id: doc.id,
                ...rawData,
                createdAt: fallbackDate,
                updatedAt: rawData.updatedAt || new Date().toISOString(),
                category: rawData.category || 'General',
                stock: rawData.stock || 0,
                salePrice: rawData.salePrice || 0,
                costPrice: rawData.costPrice || 0,
                gst: rawData.gst || 0
            } as Product;
        });

        data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return data;
    } catch (error) {
        console.error('Fetch error:', error);
        return [];
    }
};

export const addProduct = async (productData: Omit<Product, 'id'>): Promise<Product> => {
    const now = new Date().toISOString();
    const dataWithTimestamps = { ...productData, createdAt: now, updatedAt: now };
    const docRef = await addDoc(collection(db, 'products'), dataWithTimestamps);
    return { id: docRef.id, ...dataWithTimestamps };
};

export const updateProduct = async (productId: string, updates: Partial<Product>): Promise<void> => {
    if (!productId?.trim()) throw new Error("Invalid product ID");
    const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, v]) => v !== undefined && v !== null)
    );
    const updatesWithTimestamp = { ...cleanUpdates, updatedAt: new Date().toISOString() };
    await setDoc(doc(db, 'products', productId.trim()), updatesWithTimestamp, { merge: true });
};

export const deleteProduct = async (productId: string): Promise<void> => {
    if (!productId?.trim()) throw new Error("Invalid product ID");
    await deleteDoc(doc(db, 'products', productId.trim()));
};

// ORDER & PAYMENT FUNCTIONS
export const getOrders = async (): Promise<Order[]> => {
    try {
        if (!db) {
            console.error("CRITICAL ERROR: Firestore 'db' instance is undefined.");
            return [];
        }

        let q = query(collection(db, 'orders'));
        try {
            q = query(q, orderBy('orderDate', 'desc'));
        } catch (e) {
            console.warn('orderDate not available for ordering');
        }

        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                _id: doc.id,
                id: (data as any).id || doc.id,
                ...data
            } as Order;
        });
    } catch (error) {
        console.error("Error fetching orders:", error);
        return [];
    }
};

export const getOrdersByCustomerId = async (customerId: string): Promise<Order[]> => {
    if (!customerId) return [];
    try {
        let q = query(collection(db, 'orders'), where('customerId', '==', customerId));
        try {
            q = query(q, orderBy('orderDate', 'desc'));
        } catch (e) {
            console.warn('orderDate not available for ordering');
        }
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
    } catch (error) {
        console.error(`Error fetching orders for customer ${customerId}:`, error);
        return [];
    }
};

export const getInvoices = async (): Promise<Order[]> => {
    try {
        if (!db) return [];

        let q = query(collection(db, 'orders'));
        try {
            q = query(q, orderBy('orderDate', 'desc'));
        } catch (e) {
            console.warn('orderDate not available for invoice ordering');
        }

        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                _id: doc.id,
                id: (data as any).id || doc.id,
                ...data
            } as Order;
        });
    } catch (error) {
        console.error("Error fetching invoices:", error);
        return [];
    }
};

async function getNextId(transaction: Transaction, counterName: string, prefix: string): Promise<string> {
    const counterRef = doc(db, "counters", counterName);
    const counterSnap = await transaction.get(counterRef);
    let nextNumber = 1;
    if (counterSnap.exists()) {
        nextNumber = counterSnap.data().currentNumber + 1;
    }
    transaction.set(counterRef, { currentNumber: nextNumber }, { merge: true });
    return `${prefix}-${String(nextNumber).padStart(4, '0')}`;
}

const cleanDataForFirebase = (data: any): any => {
    if (data === null || data === undefined) {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(item => cleanDataForFirebase(item));
    }

    if (typeof data === 'object' && !(data instanceof Date)) {
        const newObj: { [key: string]: any } = {};
        for (const key in data) {
            if (data.hasOwnProperty(key) && data[key] !== undefined) {
                newObj[key] = cleanDataForFirebase(data[key]);
            }
        }
        return newObj;
    }

    return data;
};

async function runBalanceChainUpdate(customerId: string, workload: (orders: Order[]) => Order[]) {
    // Read outside the transaction
    const ordersQuery = query(collection(db, 'orders'), where('customerId', '==', customerId));

    try {
        await runTransaction(db, async (transaction) => {
            const customerOrdersSnap = await getDocs(ordersQuery);
            let orders = customerOrdersSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Order);

            // Apply the specific operation (add, update, delete, pay) in memory
            orders = workload(orders);

            // Sort by date to ensure correct calculation sequence
            orders.sort((a, b) => {
                try {
                    const dateA = a.orderDate ? new Date(a.orderDate).getTime() : 0;
                    const dateB = b.orderDate ? new Date(b.orderDate).getTime() : 0;
                    if (isNaN(dateA)) return -1;
                    if (isNaN(dateB)) return 1;
                    return dateA - dateB;
                } catch (e) {
                    console.error("Error parsing dates for sorting:", a.orderDate, b.orderDate);
                    return 0;
                }
            });

            // Recalculate the entire chain
            let runningPreviousBalance = 0;
            for (let i = 0; i < orders.length; i++) {
                const order = orders[i];
                const orderRef = doc(db, 'orders', order.id);

                // For the very first order in the chain, if it's an opening balance order,
                // we trust the 'previousBalance' value coming from the form.
                // Otherwise, we use the calculated running balance.
                if (i === 0 && order.isOpeningBalance) {
                    // This is the key change: trust the incoming value for the first order if it's an OB.
                    runningPreviousBalance = order.previousBalance;
                } else if (i > 0) {
                    runningPreviousBalance = orders[i - 1].balanceDue ?? 0;
                } else {
                    runningPreviousBalance = 0;
                }

                order.previousBalance = runningPreviousBalance;

                // If the order is Canceled or Deleted, its financial value should be 0 in the rolling balance.
                const isInvalid = order.status === 'Canceled' || order.status === 'Deleted' || (order as any)._isDeleted;
                const currentBillValue = isInvalid ? 0 : (order.total - (order.discount || 0) + (order.deliveryFees || 0));
                order.grandTotal = currentBillValue + order.previousBalance;

                const totalPaid = (order.payments || []).reduce((sum, p) => sum + p.amount, 0);
                order.balanceDue = order.grandTotal - totalPaid;

                if (order.status !== 'Canceled' && order.status !== 'Deleted') {
                    order.status = order.balanceDue <= 0 ? 'Fulfilled' : (totalPaid > 0 ? 'Part Payment' : 'Pending');
                }

                // Write the updated order back to the database
                const cleanedOrder = cleanDataForFirebase(order);
                transaction.set(orderRef, cleanedOrder);
            }
        });
    } catch (e) {
        console.error("runBalanceChainUpdate transaction failed:", e);
        if (e instanceof Error) {
            throw new Error(`A database error occurred: ${e.message}`);
        }
        throw new Error("An unknown database error occurred during the transaction.");
    }
}

export const addOrder = async (orderData: Omit<Order, 'id' | 'customerName'>): Promise<Order> => {
    const now = new Date().toISOString(); // NEW: For timestamps
    let finalNewOrder: Order | null = null;

    await runTransaction(db, async (transaction) => {
        const customerRef = doc(db, 'customers', orderData.customerId);
        const customerSnap = await transaction.get(customerRef);
        if (!customerSnap.exists()) throw new Error("Customer not found");

        const customerName = customerSnap.data()?.name;

        const newOrderId = await getNextId(transaction, 'orderCounter', 'ORD');

        let newOrder: Order = {
            ...orderData,
            id: newOrderId!,
            customerName: customerName,
            balanceDue: 0,
            grandTotal: 0,
            status: 'Pending',
            createdAt: now, // NEW: Timestamp
            updatedAt: now // NEW: Timestamp
        };

        if (newOrder.paymentTerm === 'Full Payment' && newOrder.payments && newOrder.payments.length > 0) {
            newOrder.payments[0].id = `${newOrderId}-PAY-01`;
        }

        finalNewOrder = newOrder; // Store for return value

        // We call the balance chain update, but it will happen inside this same transaction context
        await runBalanceChainUpdate(orderData.customerId, (orders) => {
            return [...orders, newOrder];
        });

        if (!newOrder.isOpeningBalance) {
            const netOrderValue = newOrder.total - (newOrder.discount || 0) + (newOrder.deliveryFees || 0);
            transaction.update(customerRef, {
                'transactionHistory.totalSpent': increment(netOrderValue),
                'transactionHistory.lastPurchaseDate': newOrder.orderDate
            });
        }

        for (const item of newOrder.items) {
            if (item.productId !== 'OPENING_BALANCE') {
                const productRef = doc(db, "products", item.productId);
                transaction.update(productRef, { stock: increment(-item.quantity) });
            }
        }
    });

    if (!finalNewOrder) throw new Error("Failed to create the new order.");
    return finalNewOrder;
};

export const updateOrder = async (orderData: Order): Promise<void> => {
    if (!orderData.id) throw new Error("Order ID is required to update.");

    const originalOrderSnap = await getDoc(doc(db, "orders", orderData.id));
    if (!originalOrderSnap.exists()) throw new Error("Cannot update order that does not exist.");

    const originalOrder = originalOrderSnap.data() as Order;

    await runTransaction(db, async (transaction) => {
        // Restore stock and customer balance from original order
        for (const item of originalOrder.items) {
            if (item.productId !== 'OPENING_BALANCE') {
                transaction.update(doc(db, "products", item.productId), { stock: increment(item.quantity) });
            }
        }
        if (!originalOrder.isOpeningBalance) {
            const originalNetValue = originalOrder.total - (originalOrder.discount || 0) + (originalOrder.deliveryFees || 0);
            transaction.update(doc(db, "customers", originalOrder.customerId), { 'transactionHistory.totalSpent': increment(-originalNetValue) });
        }

        // Apply new stock and customer balance changes from the updated order
        orderData.isOpeningBalance = orderData.items.some(item => item.productName === 'Opening Balance');
        orderData.updatedAt = new Date().toISOString(); // NEW: Timestamp on update
        for (const item of orderData.items) {
            if (item.productId !== 'OPENING_BALANCE') {
                transaction.update(doc(db, "products", item.productId), { stock: increment(-item.quantity) });
            }
        }
        if (!orderData.isOpeningBalance) {
            const newNetValue = orderData.total - (orderData.discount || 0) + (orderData.deliveryFees || 0);
            transaction.update(doc(db, "customers", orderData.customerId), { 'transactionHistory.totalSpent': increment(newNetValue) });
        }

        // Recalculate the entire balance chain with the updated order
        await runBalanceChainUpdate(orderData.customerId, (orders) =>
            orders.map(o => o.id === orderData.id ? orderData : o)
        );
    });
};

export const deleteOrder = async (orderToDelete: Order): Promise<void> => {
    if (!orderToDelete.id) throw new Error("Order ID is required for deletion.");

    await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, "orders", orderToDelete.id);

        // 1. RECALCULATE BALANCE CHAIN (exclude this order)
        await runBalanceChainUpdate(orderToDelete.customerId, (orders) =>
            orders.filter(o => o.id !== orderToDelete.id)
        );

        // 2. RESTORE STOCK (same as before)
        for (const item of orderToDelete.items) {
            if (item.productId !== 'OPENING_BALANCE') {
                transaction.update(doc(db, "products", item.productId), {
                    stock: increment(item.quantity)
                });
            }
        }

        // 3. REVERSE CUSTOMER SPEND (same as before)
        if (!orderToDelete.isOpeningBalance) {
            const netValue = orderToDelete.total - (orderToDelete.discount || 0) + (orderToDelete.deliveryFees || 0);
            transaction.update(doc(db, "customers", orderToDelete.customerId), {
                'transactionHistory.totalSpent': increment(-netValue)
            });
        }

        // 4. SOFT DELETE: MARK AS DELETED (DO NOT DELETE DOC)
        transaction.update(orderRef, {
            status: 'Deleted',
            deletedAt: new Date().toISOString(),
            deletedBy: 'admin', // Replace with current user if auth exists
            _isDeleted: true // For easy querying
        });
    });
};

export const addPaymentToOrder = async (
    customerId: string,
    orderPrettyId: string,  // This is ORD-0040, ORD-0041, etc.
    payment: Omit<Payment, 'id'>
): Promise<Payment> => {
    try {
        // Step 1: Find the actual Firestore document using the pretty 'id' field
        const q = query(
            collection(db, 'orders'),
            where('id', '==', orderPrettyId)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            throw new Error(`Order with id ${orderPrettyId} not found in database`);
        }

        const orderDoc = snapshot.docs[0];
        const orderData = orderDoc.data() as Order;
        const realOrderId = orderDoc.id; // This is the real Firestore doc ID

        // Step 2: Proceed with balance chain update using the real document
        let newPayment: Payment | null = null;

        await runBalanceChainUpdate(customerId, (orders) => {
            const orderToUpdate = orders.find(o => o.id === orderPrettyId);
            if (!orderToUpdate) throw new Error('Order not found in customer chain');

            const payments = orderToUpdate.payments || [];
            const paymentId = `${orderPrettyId}-PAY-${String(payments.length + 1).padStart(2, '0')}`;

            newPayment = { ...payment, id: paymentId };
            orderToUpdate.payments = [...payments, newPayment];

            return orders;
        });

        return newPayment!;

    } catch (error) {
        console.error('Error adding payment:', error);
        throw error;
    }
};

interface BulkPaymentData {
    customerId: string;
    paymentDate: string;
    paymentMethod: PaymentMode;
    notes?: string;
    allocations: { orderId: string, amount: number }[];
}

export const addBulkPayment = async (data: BulkPaymentData): Promise<void> => {
    await runBalanceChainUpdate(data.customerId, (orders) => {
        // Create a map for quick lookup of orders
        const ordersMap = new Map(orders.map(o => [o.id, o]));

        // Apply each allocation to its corresponding order in memory
        for (const allocation of data.allocations) {
            const orderToUpdate = ordersMap.get(allocation.orderId);
            if (orderToUpdate) {
                const existingPayments: Payment[] = orderToUpdate.payments || [];
                const paymentId = `${allocation.orderId}-PAY-${String(existingPayments.length + 1).padStart(2, '0')}`;

                const newPayment: Payment = {
                    id: paymentId,
                    amount: allocation.amount,
                    paymentDate: data.paymentDate,
                    method: data.paymentMethod,
                    notes: `Part of bulk payment. ${data.notes || ''}`.trim(),
                };

                orderToUpdate.payments = [...existingPayments, newPayment];
            } else {
                // This case should ideally be handled, but for now we log it.
                console.warn(`Could not find order ${allocation.orderId} during bulk payment application.`);
            }
        }

        // Return the modified list of all orders for the customer
        return Array.from(ordersMap.values());
    });
};

// SUPPLIER FUNCTIONS
export const getSuppliers = async (): Promise<Supplier[]> => {
    try {
        // ENHANCED: Add orderBy (name desc, assuming field)
        let q = query(collection(db, 'suppliers'));
        try {
            q = query(q, orderBy('name', 'desc'));
        } catch (e) {
            console.warn('name field not available for ordering');
        }
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
    } catch (error) {
        console.error("Error fetching suppliers: ", error);
        return [];
    }
};

export const addSupplier = async (supplierData: Omit<Supplier, 'id'>): Promise<Supplier> => {
    const now = new Date().toISOString(); // NEW: Timestamps
    const dataWithTimestamps = { // NEW: Add for sync
        ...supplierData,
        createdAt: now,
        updatedAt: now
    };
    const docRef = await addDoc(collection(db, 'suppliers'), dataWithTimestamps);
    return { id: docRef.id, ...dataWithTimestamps } as Supplier;
};

export const updateSupplier = async (supplierData: Partial<Supplier>): Promise<void> => {
    const { id, ...dataToUpdate } = supplierData;
    if (!id) throw new Error("Supplier ID is required to update.");
    const updatesWithTimestamp = { // NEW: Add updatedAt
        ...dataToUpdate,
        updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'suppliers', id), updatesWithTimestamp, { merge: true });
};

export const deleteSupplier = async (id: string): Promise<void> => {
    await deleteDoc(doc(db, 'suppliers', id));
};

// PURCHASE FUNCTIONS
export const getPurchases = async (): Promise<Purchase[]> => {
    try {
        // ENHANCED: Add orderBy (createdAt desc)
        let q = query(collection(db, 'purchases'));
        try {
            q = query(q, orderBy('createdAt', 'desc'));
        } catch (e) {
            console.warn('createdAt not available for ordering');
        }
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Purchase));
    } catch (error) {
        console.error("Error fetching purchases: ", error);
        return [];
    }
};

export const addPurchase = async (purchaseData: Omit<Purchase, 'id' | 'supplierName'>): Promise<Purchase> => {
    const now = new Date().toISOString(); // NEW: Timestamp
    let newPurchaseWithId!: Purchase;

    await runTransaction(db, async (transaction) => {
        const supplierRef = doc(db, "suppliers", purchaseData.supplierId);
        const supplierSnap = await transaction.get(supplierRef);
        if (!supplierSnap.exists()) throw new Error("Supplier not found");

        const purchaseId = await getNextId(transaction, 'purchaseCounter', 'PUR');

        newPurchaseWithId = {
            ...purchaseData,
            supplierName: supplierSnap.data()?.name,
            id: purchaseId,
            createdAt: now, // NEW
            updatedAt: now // NEW
        };

        if (newPurchaseWithId.payments && newPurchaseWithId.payments.length > 0) {
            newPurchaseWithId.payments = newPurchaseWithId.payments.map((p, i) => ({
                ...p,
                id: `${purchaseId}-PAY-${String(i + 1).padStart(2, '0')}`
            }));
        }

        transaction.set(doc(db, "purchases", purchaseId), newPurchaseWithId);

        for (const item of newPurchaseWithId.items) {
            const productRef = doc(db, "products", item.productId);
            transaction.update(productRef, { stock: increment(item.quantity) });
        }
    });

    return newPurchaseWithId;
};

export const addPaymentToPurchase = async (purchaseId: string, payment: Omit<PurchasePayment, 'id'>): Promise<Purchase> => {
    const purchaseRef = doc(db, "purchases", purchaseId);
    let updatedPurchase!: Purchase;

    try {
        await runTransaction(db, async (transaction) => {
            const purchaseSnap = await transaction.get(purchaseRef);
            if (!purchaseSnap.exists()) throw new Error("Purchase not found!");

            const purchase = { id: purchaseSnap.id, ...purchaseSnap.data() } as Purchase;
            const existingPayments = purchase.payments || [];
            const paymentId = `${purchase.id}-PAY-${String(existingPayments.length + 1).padStart(2, '0')}`;
            const newPayment: PurchasePayment = { ...payment, id: paymentId };
            const newBalance = purchase.balanceDue - newPayment.amount;

            updatedPurchase = {
                ...purchase,
                payments: [...existingPayments, newPayment],
                balanceDue: newBalance,
                updatedAt: new Date().toISOString() // NEW: Timestamp
            };

            transaction.update(purchaseRef, {
                payments: updatedPurchase.payments,
                balanceDue: updatedPurchase.balanceDue,
                updatedAt: updatedPurchase.updatedAt // Include in update
            });
        });
    } catch (e) {
        console.error("Add payment to purchase transaction failed:", e);
        if (e instanceof Error) throw new Error(`A database error occurred: ${e.message}`);
        throw new Error("An unknown database error occurred during the transaction.");
    }
    return updatedPurchase;
};

// DASHBOARD & REPORTING DATA (Your original, unchanged)
export const getDashboardData = async () => {
    const ordersPromise = getOrders();
    const customersPromise = getCustomers();
    const productsPromise = getProducts();

    const [orders, customers, products] = await Promise.all([ordersPromise, customersPromise, productsPromise]);

    const today = startOfToday();

    // Basic Dashboard Stats
    const totalRevenue = orders.reduce((sum, order) => {
        const orderPayments = order.payments?.reduce((paymentSum, payment) => paymentSum + payment.amount, 0) ?? 0;
        return sum + orderPayments;
    }, 0);

    let totalBalanceDue = 0;
    for (const customer of customers) {
        const balance = await getCustomerBalance(customer.id);
        totalBalanceDue += balance;
    }


    const totalCustomers = customers.length;

    const itemsInStock = products
        .filter(p => p.name !== 'Outstanding Balance')
        .reduce((sum, product) => sum + product.stock, 0);

    const ordersPlaced = orders.filter(o => o.status !== 'Canceled').length;

    // Alerts
    const upcomingDateLimit = addDays(today, 7);
    const paymentAlerts = orders
        .filter(order =>
            order.dueDate &&
            (order.balanceDue ?? 0) > 0
        )
        .map(order => {
            const dueDate = new Date(order.dueDate!);
            const days = differenceInDays(dueDate, today);
            return {
                orderId: order.id,
                customerName: order.customerName,
                dueDate: order.dueDate!,
                balanceDue: order.balanceDue!,
                isOverdue: days < 0,
                days: days
            };
        })
        .filter(alert =>
            alert.isOverdue ||
            (new Date(alert.dueDate) <= upcomingDateLimit)
        )
        .sort((a, b) => a.days - b.days);

    const lowStockAlerts: LowStockAlert[] = products
        .filter(p => p.reorderPoint !== undefined && p.reorderPoint > 0 && p.stock <= p.reorderPoint && p.name !== 'Outstanding Balance')
        .map(p => ({
            productId: p.id,
            productName: p.name,
            stock: p.stock,
            reorderPoint: p.reorderPoint!
        }))
        .sort((a, b) => a.stock - b.stock);

    // BI Report Data: Profitability & Top Products
    const monthlyData: Record<string, { revenue: number, profit: number }> = {};
    const productPerformance: Record<string, { productId: string, productName: string, unitsSold: number, totalRevenue: number, estimatedProfit: number }> = {};

    orders.forEach(order => {
        const month = new Date(order.orderDate).toLocaleString('default', { month: 'short', year: 'numeric' });
        if (!monthlyData[month]) {
            monthlyData[month] = { revenue: 0, profit: 0 };
        }

        order.items.forEach(item => {
            if (item.productName === 'Outstanding Balance' || item.productName === 'Opening Balance') return;

            const revenue = item.price * item.quantity;
            const cost = item.cost * item.quantity;
            const profit = revenue - cost;

            monthlyData[month].revenue += revenue;
            monthlyData[month].profit += profit;

            if (!productPerformance[item.productId]) {
                productPerformance[item.productId] = { productId: item.productId, productName: item.productName, unitsSold: 0, totalRevenue: 0, estimatedProfit: 0 };
            }
            productPerformance[item.productId].unitsSold += item.quantity;
            productPerformance[item.productId].totalRevenue += revenue;
            productPerformance[item.productId].estimatedProfit += profit;
        });
    });

    const profitabilityChartData = Object.entries(monthlyData).map(([month, data]) => ({ month, revenue: data.revenue, profit: data.profit }));

    // BI Report Data: Inventory Intelligence
    const oneYearAgo = subMonths(today, 12);
    const sixMonthsAgo = subMonths(today, 6);

    const cogsLastYear = orders
        .filter(o => new Date(o.orderDate) >= oneYearAgo)
        .reduce((sum, order) => {
            return sum + order.items.reduce((itemSum, item) => itemSum + (item.cost * item.quantity), 0);
        }, 0);

    const averageInventoryValue = products.reduce((sum, p) => sum + (p.cost * p.stock), 0);
    const inventoryTurnoverRate = averageInventoryValue > 0 ? cogsLastYear / averageInventoryValue : 0;

    const soldProductIds = new Set(orders
        .filter(o => new Date(o.orderDate) >= sixMonthsAgo)
        .flatMap(o => o.items.map(i => i.productId))
    );
    const deadStock = products
        .filter(p => !soldProductIds.has(p.id) && p.name !== 'Outstanding Balance' && p.stock > 0)
        .map(p => ({
            productName: p.name,
            sku: p.sku,
            stock: p.stock,
            cost: p.cost
        }));

    const stockoutProducts = products
        .filter(p => p.stock === 0 && p.name !== 'Outstanding Balance')
        .map(p => {
            const salesHistory = orders
                .flatMap(o => o.items)
                .filter(i => i.productId === p.id);

            const totalDays = salesHistory.length > 0
                ? differenceInDays(today, new Date(orders.find(o => o.items.some(i => i.productId === p.id))!.orderDate))
                : 0;

            const totalUnitsSold = salesHistory.reduce((sum, i) => sum + i.quantity, 0);
            const avgDailySales = totalDays > 0 ? totalUnitsSold / totalDays : 0;
            const potentialLostRevenue = avgDailySales * p.price;

            return {
                productName: p.name,
                avgDailySales: avgDailySales.toFixed(2),
                potentialLostRevenuePerDay: potentialLostRevenue
            };
        });


    return {
        // Dashboard data
        totalRevenue,
        totalBalanceDue,
        totalCustomers,
        itemsInStock,
        ordersPlaced,
        recentOrders: orders.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()).slice(0, 5),
        paymentAlerts,
        lowStockAlerts,
        revenueChartData: profitabilityChartData, // Added for mobile view
        // Reporting data
        profitabilityChartData,
        productPerformance: Object.values(productPerformance),
        inventoryTurnoverRate: inventoryTurnoverRate.toFixed(2),
        deadStock,
        stockoutProducts,
    };
};

// This function will be called from a server-side context to reset the DB
export const resetDatabaseForFreshStart = async () => {
    const collectionsToDelete = ['customers', 'orders', 'counters', 'suppliers', 'purchases'];

    try {
        for (const collectionName of collectionsToDelete) {
            const q = query(
                collection(db, 'orders'),
                where('status', '!=', 'Deleted'),
                where('_isDeleted', '!=', true),
                orderBy('orderDate', 'desc')
            );
            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                console.log(`No documents to delete in ${collectionName}.`);
                continue;
            }
            const batch = writeBatch(db);
            snapshot.docs.forEach(doc => {
                console.log(`Scheduling deletion for doc ${doc.id} in ${collectionName}`);
                batch.delete(doc.ref);
            });
            await batch.commit();
            console.log(`All documents in ${collectionName} deleted.`);
        }

        console.log("Database collections have been cleared.");

    } catch (error) {
        console.error("Error during database reset:", error);
        throw new Error("Failed to reset the database.");
    }
};

export const resetAllPayments = async () => {
    try {
        const ordersQuery = query(collection(db, 'orders'));
        const snapshot = await getDocs(ordersQuery);

        if (snapshot.empty) {
            console.log("No orders found to reset payments.");
            return;
        }

        const customerIds = new Set(snapshot.docs.map(doc => (doc.data() as Order).customerId));

        for (const customerId of customerIds) {
            await runBalanceChainUpdate(customerId, (orders) => {
                return orders.map(order => ({
                    ...order,
                    payments: []
                }));
            });
        }

        console.log(`Reset payments for all orders across ${customerIds.size} customers.`);

    } catch (error) {
        console.error("Error resetting payments:", error);
        throw new Error("Failed to reset payments for all orders.");
    }
};

export const deletePaymentFromOrder = async (
    customerId: string,
    orderId: string,
    paymentId: string
) => {
    console.log(`Attempting to delete payment ${paymentId} from order ${orderId} for customer ${customerId}`);

    const updateChain = (orders: Order[]) => {
        return orders.map(order => {
            if (order.id === orderId) {
                const updatedPayments = (order.payments || []).filter(p => p.id !== paymentId);
                return {
                    ...order,
                    payments: updatedPayments,
                    updatedAt: new Date().toISOString() // NEW: Timestamp on update
                } as Order;
            }
            return order;
        });
    };

    try {
        await runBalanceChainUpdate(customerId, updateChain);
        console.log(`Successfully deleted payment ${paymentId} from order ${orderId}.`);

        // Fetch the updated order from Firestore
        const q = query(
            collection(db, 'orders'),
            where('id', '==', orderId)
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const updatedOrder = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Order;
            return { success: true, updatedOrder };
        }

        return { success: true, updatedOrder: undefined };
    } catch (error) {
        console.error("Error deleting payment from order:", error);
        throw new Error("Failed to delete payment from order.");
    }
};

// Permanently delete an order (hard delete from database)
// This should only be used for orders that are already soft-deleted
export const permanentlyDeleteOrder = async (orderId: string): Promise<void> => {
    try {
        // Find the order document by the pretty ID (ORD-XXXX)
        const q = query(
            collection(db, 'orders'),
            where('id', '==', orderId)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            throw new Error(`Order with id ${orderId} not found in database`);
        }

        const orderDoc = snapshot.docs[0];
        const orderData = orderDoc.data() as Order;

        // Safety check: only allow permanent deletion of already deleted orders
        if (orderData.status !== 'Deleted' || !orderData._isDeleted) {
            throw new Error('Can only permanently delete orders that are already soft-deleted');
        }

        // Permanently delete the document from Firestore
        await deleteDoc(doc(db, 'orders', orderDoc.id));

        console.log(`Successfully permanently deleted order ${orderId}`);
    } catch (error) {
        console.error("Error permanently deleting order:", error);
        throw error;
    }
};

// =============================================================================
// NEW: REAL-TIME LISTENER FUNCTIONS (For Global Sync – Call from Components/Hooks)
// =============================================================================
// Each returns an unsubscribe function. Use with your fetches for initial load + live updates.
// E.g., listenToOrders(callback) – callback fires on add/edit/delete.

export const listenToCustomers = (callback: (customers: Customer[]) => void): (() => void) => {
    let q = query(collection(db, 'customers'), orderBy('name')); // Your preferred order
    const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
            const customers = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            } as Customer));
            callback(customers);
        },
        (error) => {
            console.error('Customers listener error:', error);
            callback([]);
        }
    );
    return unsubscribe;
};

export const listenToProducts = (callback: (products: Product[]) => void): (() => void) => {
    let q = query(collection(db, 'products'));
    try {
        q = query(q, orderBy('createdAt', 'desc'));
    } catch (e) {
        q = query(collection(db, 'products')); // Fallback
    }
    const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
            const products = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            } as Product));
            callback(products);
        },
        (error) => {
            console.error('Products listener error:', error);
            callback([]);
        }
    );
    return unsubscribe;
};

export const listenToOrders = (callback: (orders: Order[]) => void): (() => void) => {
    let q = query(collection(db, 'orders'));
    try {
        q = query(q, orderBy('orderDate', 'desc')); // Your schema
    } catch (e) {
        q = query(collection(db, 'orders')); // Fallback
    }
    const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
            const orders = snapshot.docs.map((doc) => ({
                ...doc.data(),
                _id: doc.id // Your mapping style
            } as Order));
            callback(orders);
        },
        (error) => {
            console.error('Orders listener error:', error);
            callback([]);
        }
    );
    return unsubscribe;
};

export const listenToSuppliers = (callback: (suppliers: Supplier[]) => void): (() => void) => {
    let q = query(collection(db, 'suppliers'), orderBy('name', 'desc'));
    const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
            const suppliers = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            } as Supplier));
            callback(suppliers);
        },
        (error) => {
            console.error('Suppliers listener error:', error);
            callback([]);
        }
    );
    return unsubscribe;
};

export const listenToPurchases = (callback: (purchases: Purchase[]) => void): (() => void) => {
    let q = query(collection(db, 'purchases'));
    try {
        q = query(q, orderBy('createdAt', 'desc'));
    } catch (e) {
        q = query(collection(db, 'purchases')); // Fallback
    }
    const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
            const purchases = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            } as Purchase));
            callback(purchases);
        },
        (error) => {
            console.error('Purchases listener error:', error);
            callback([]);
        }
    );
    return unsubscribe;
};

// BONUS: Listen to invoices (uses orders, as per your setup)
export const listenToInvoices = (callback: (invoices: Order[]) => void): (() => void) => {
    return listenToOrders(callback); // Alias – since invoices are orders
};