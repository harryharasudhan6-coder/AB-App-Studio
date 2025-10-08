
export type CalculationType = 'Per Unit' | 'Per Kg';

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

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone: string;
  address: string;
  gstin?: string;
}

export type ProductCategory = 'General' | 'Red Bricks' | 'Rods & Rings';

export interface Product {
  id: string;
  name: string;
  sku: string;
  stock: number;
  price: number;
  cost: number; // Cost of Goods Sold
  gst: number;
  reorderPoint?: number;
  calculationType?: CalculationType;
  category?: ProductCategory;
  brand?: string;
  weightPerUnit?: number; // Weight in KG, for Rods & Rings
  historicalData?: { date: string; quantity: number }[];
}

export type OrderStatus = 'Pending' | 'Part Payment' | 'Fulfilled' | 'Canceled';
export type PaymentTerm = 'Full Payment' | 'Credit';
export type PurchasePaymentTerm = 'Paid' | 'Credit';
export type PaymentMode = 'Cash' | 'Card' | 'UPI' | 'Cheque' | 'Online Transfer';

export interface Payment {
  id: string;
  paymentDate: string;
  amount: number;
  method: PaymentMode;
  reference?: string;
  notes?: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  cost: number; // Snapshot of cost at time of sale
  gst: number;
  calculationType?: CalculationType;
  category?: ProductCategory;
  brand?: string; // Brand for items like bricks
  totalWeight?: number; // For Rods & Rings
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  cost: number;
  gst: number;
}

export interface PurchasePayment {
    id: string;
    paymentDate: string;
    amount: number;
    method: PaymentMode;
    notes?: string;
}

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
}


export interface Order {
  _id?: string;
  id:string;
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
}

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
