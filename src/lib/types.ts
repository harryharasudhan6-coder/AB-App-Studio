// src/lib/types.ts (Your Code + Optimizations: Timestamps, Required Fields, Minor Enhancements)
import { Timestamp } from 'firebase/firestore';  // For server timestamps (add to data.ts imports)

// Enums (Unchanged)
export type CalculationType = 'Per Unit' | 'Per Kg';

export type ProductCategory = 'General' | 'Red Bricks' | 'Rods & Rings' | 'Savukku Stick';

export type OrderStatus = 'Pending' | 'Part Payment' | 'Fulfilled' | 'Canceled'| 'Deleted';
export type PaymentTerm = 'Full Payment' | 'Credit';
export type PurchasePaymentTerm = 'Paid' | 'Credit';
export type PaymentMode = 'Cash' | 'Card' | 'UPI' | 'Cheque' | 'Online Transfer';
export type SortKey =
  | 'id'
  | 'customerName'
  | 'orderDate'
  | 'grandTotal'
  | 'balanceDue'
  | 'status';

// Customer (Unchanged + orders? for relation)
export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  gstin?: string;
  transactionHistory: {
    totalSpent: number;
    lastPurchaseDate: string;
  };
  // Added to support bulk payment dialog
  orders?: Order[];
}

// Supplier (Unchanged)
export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone: string;
  address: string;
  gstin?: string;
  createdAt?: string | Timestamp;  // Added (optional)
  updatedAt?: string | Timestamp;  // Added for audit

}

// Product (Your Code + Timestamps; Made category/calculationType Required; cost Required)
export interface Product {
  id: string;
  name: string;
  sku: string;
  stock: number;
  price?: number;  // Keep for legacy
  salePrice: number;  // Add: Matches DB
  costPrice?: number;  // Add: If using for costs
  cost: number; // Cost of Goods Sold (required, default 0 in dialogs if needed)
  gst?: number;  // GST % (0-100)
  reorderPoint?: number;
  calculationType: CalculationType;  // Made required for pricing logic
  category: ProductCategory;  // Made required for conditional fields (e.g., weightPerUnit)
  brand?: string;
  weightPerUnit?: number; // Weight in KG, for Rods & Rings
  historicalData?: { date: string; quantity: number }[];
  createdAt?: string | null;  // ISO string from serialized Timestamp (e.g., "2024-01-01T00:00:00.000Z")
  updatedAt?: string | null;  // ISO string from serialized Timestamp
}

// Payment (Unchanged)
export interface Payment {
  id: string;
  paymentDate: string;
  amount: number;
  method: PaymentMode;
  reference?: string;
  notes?: string;
}

// OrderItem (Your Code + id?: string; weightPerUnit? for direct Product link)
export interface OrderItem {
  id?: string;  // Added: Optional for new items (Firestore auto-ID)
  productId: string;
  productName: string;
  quantity: number;
  price: string;
  sku: string;
  cost: number; // Snapshot of cost at time of sale
  gst?: number;  // GST % snapshot
  calculationType?: CalculationType;
  category?: ProductCategory;
  brand?: string; // Brand for items like bricks
  total: number;
  totalWeight?: number; // For Rods & Rings (computed: weightPerUnit * quantity)
  weightPerUnit?: number;  // Added: Snapshot from Product.weightPerUnit (for kg calcs)
}

// PurchaseItem (Unchanged)
export interface PurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  cost: number;
  gst: number;
}

// PurchasePayment (Unchanged, but fixed indent)
export interface PurchasePayment {
    id: string;
    paymentDate: string;
    amount: number;
    method: PaymentMode;
    notes?: string;
}

// Purchase (Unchanged + Optional Timestamps)
export interface Purchase {
    id: string;
    supplierId: string;
    supplierName: string;
    purchaseDate: string;
    items: PurchaseItem[];
    isGstPurchase: boolean;
    total: number;
    payments: PurchasePayment[];
    balanceDue: number;
    paymentTerm: PurchasePaymentTerm;
    dueDate?: string;
    createdAt?: string | Timestamp;  // Added (optional)
    updatedAt?: string | Timestamp;  // Added (optional)
}

// Order (Unchanged + Optional Timestamps)
export interface Order {
  _id?: string;
  id: string;
  customerId: string;
  customerName: string;
  orderDate: string;
  status: OrderStatus;
  items: OrderItem[];
  total: number;
  discount: number;
  deliveryFees: number;
  previousBalance: number;
  grandTotal: number;
  paymentTerm: PaymentTerm;
  paymentMode?: PaymentMode;
  paymentRemarks?: string;
  dueDate?: string;
  deliveryDate?: string;
  deliveryAddress?: string;
  isGstInvoice: boolean;
  isOpeningBalance: boolean;
  payments?: Payment[];
  balanceDue?: number;
  createdAt?: string | Timestamp;  // Added (optional)
  updatedAt?: string | Timestamp;  // Added (optional)
}

// Alerts (Unchanged)
export interface PaymentAlert {
  orderId: string;
  customerName: string;
  dueDate: string;
  balanceDue: number;
  isOverdue: boolean;
  days: number; // Positive for upcoming, negative for overdue
}

export interface LowStockAlert {
    productId: string;
    productName: string;
    stock: number;
    reorderPoint: number;
}