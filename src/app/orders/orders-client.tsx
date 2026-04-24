'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Order, Customer, Product, PaymentTerm, PaymentMode, CalculationType, ProductCategory, OrderItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, FileText, Loader2, PlusCircle, Trash2, Edit, Share2, FileSpreadsheet, ArrowUpDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { addOrder, addCustomer, deleteOrder as deleteOrderFromDB, getCustomerBalance, getProducts, updateOrder, getCoreOrderData } from '@/lib/data';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/ui/combobox';
import * as XLSX from 'xlsx';
import { startOfWeek, startOfMonth, subMonths, isWithinInterval, type Interval } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { UserOptions } from 'jspdf-autotable';

// --- TYPES & INTERFACES ---
interface jsPDFWithPlugin extends jsPDF {
    autoTable: (options: UserOptions) => jsPDF;
    previousAutoTable: { finalY: number };
}

type SortKey = keyof Order | 'id' | 'customerName' | 'orderDate' | 'status' | 'grandTotal';

// --- UTILS ---
const formatNumberForDisplay = (value: number | undefined) => {
    const amount = value ?? 0;
    return new Intl.NumberFormat('en-IN', { 
        style: 'currency', 
        currency: 'INR',
        maximumFractionDigits: 2 
    }).format(amount);
};

// --- HELPER (Will be shared with Part 2) ---
const isWeightBased = (category: ProductCategory | string) => {
    return category === 'Rings' || category === 'Rods' || category === 'Steel';
};

export function OrdersClient({ 
    orders: initialOrders, 
    customers: initialCustomers, 
    products: initialProducts 
}: { 
    orders: Order[], 
    customers: Customer[], 
    products: Product[] 
}) {
    // --- STATE ---
    const [orders, setOrders] = useState<Order[]>(initialOrders);
    const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [isLoading, setIsLoading] = useState(false);
    const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);
    const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);
    const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
    const [orderToEdit, setOrderToEdit] = useState<Order | null>(null);
    const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState('All');
    const [isMounted, setIsMounted] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' } | null>(null);
    
    // --- EFFECTS ---
    useEffect(() => {
        setIsMounted(true);
        const savedLogo = localStorage.getItem('companyLogo');
        if (savedLogo) setLogoUrl(savedLogo);
    }, []);

    // --- HANDLERS ---
    const openOrderDialog = async () => {
        setIsLoading(true);
        try {
            const freshProducts = await getProducts();
            setProducts(freshProducts);
            setIsAddOrderOpen(true);
        } catch(e) {
            toast({ title: 'Error', description: 'Could not fetch latest product data.', variant: 'destructive'});
        } finally {
            setIsLoading(false);
        }
    }
    
    const openEditDialog = async (order: Order) => {
        setIsLoading(true);
        try {
            const freshProducts = await getProducts();
            setProducts(freshProducts);
            setOrderToEdit(order);
        } catch(e) {
            toast({ title: 'Error', description: 'Could not fetch latest product data.', variant: 'destructive'});
        } finally {
            setIsLoading(false);
        }
    }

    const requestSort = (key: SortKey) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig?.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // --- MEMOS ---
    const sortedOrders = useMemo(() => {
        let sortableItems = [...orders];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                if (aValue == null) return 1;
                if (bValue == null) return -1;
                
                if (sortConfig.key === 'orderDate') {
                    const dateA = new Date(aValue as string).getTime();
                    const dateB = new Date(bValue as string).getTime();
                    return sortConfig.direction === 'ascending' ? dateA - dateB : dateB - dateA;
                }
                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
                }
                return sortConfig.direction === 'ascending' 
                    ? String(aValue).localeCompare(String(bValue))
                    : String(bValue).localeCompare(String(aValue));
            });
        }
        return sortableItems;
    }, [orders, sortConfig]);

    const filteredOrders = useMemo(() => {
        const now = new Date();
        let filtered = sortedOrders.filter(order =>
            order.status !== 'Deleted' && order.status !== 'Canceled' && (
                order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                order.customerName.toLowerCase().includes(searchQuery.toLowerCase())
            )
        );

        if (dateFilter !== 'All') {
            let interval: Interval;
            if (dateFilter === 'This Week') interval = { start: startOfWeek(now), end: now };
            else if (dateFilter === 'This Month') interval = { start: startOfMonth(now), end: now };
            else if (dateFilter === 'Last Month') {
                const startOfLastMonth = subMonths(startOfMonth(now), 1);
                interval = { start: startOfLastMonth, end: startOfMonth(now) };
            } else return filtered;

            filtered = filtered.filter(order => isWithinInterval(new Date(order.orderDate), interval));
        }
        return filtered;
    }, [sortedOrders, searchQuery, dateFilter]);

    // --- PDF / SHARE LOGIC ---
    const handleGenerateInvoice = (order: Order) => setOrderToPrint(order);
    
    useEffect(() => {
        if (orderToPrint) handlePrint();
    }, [orderToPrint]);

    const handleWhatsAppShare = (order: Order) => {
        const customer = customers.find(c => c.id === order.customerId);
        if (!customer?.phone) {
            toast({ title: 'WhatsApp Error', description: `No phone number found.`, variant: 'destructive' });
            return;
        }
        
        const cleanName = customer.name.replace(' (Walk-In)', '');
        const sanitizedPhone = customer.phone.replace(/\D/g, '');
        const finalPhone = sanitizedPhone.length === 10 ? `91${sanitizedPhone}` : sanitizedPhone;
        const formattedAmount = formatNumberForDisplay(order.grandTotal);
        const invoiceId = order.id.replace('ORD', 'INV');

        const message = `Hello *${cleanName}*,%0A%0AHere is your invoice *${invoiceId}* from *AB Agency*.%0A%0A*Grand Total:* ${formattedAmount}%0A%0AThank you for your business!`;
        window.open(`https://wa.me/${finalPhone}?text=${message}`, '_blank');
    };

    const handlePrint = async () => {
        if (!orderToPrint) return;
        const customer = customers.find(c => c.id === orderToPrint.customerId);
        if(!customer) return;

        setIsLoading(true);
        try {
            const doc = new jsPDF() as jsPDFWithPlugin;
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 14;

            const formatNumber = (val: number | undefined) => 
                `INR ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(val ?? 0)}`;
            
            const formatQuantity = (item: OrderItem) => {
                if (isWeightBased(item.category)) return `${item.quantity} nos`;
                if (item.calculationType === 'Per Kg') return `${item.quantity.toFixed(2)} kg`;
                return `${item.quantity} pcs`;
            }
            
            const formatRate = (item: OrderItem) => {
                let rate = formatNumber(item.price);
                if (item.calculationType === 'Per Kg') rate += '/kg';
                return rate;
            }

            if (logoUrl) {
                try {
                    doc.addImage(logoUrl, 'PNG', pageWidth / 2 - 12.5, 15, 25, 20);
                } catch (e) { console.error("Logo failed to load in PDF"); }
            }
            
            doc.setFontSize(9).setFont('helvetica', 'normal');
            doc.text('No.1, Ayyanchery main road, Urapakkam, Chennai - 603210', pageWidth / 2, 40, { align: 'center' });
            doc.text('Email: abagency1977@gmail.com | MOB: 95511 95505 / 95001 82975', pageWidth / 2, 44, { align: 'center' });
            doc.line(margin, 48, pageWidth - margin, 48);

            let yPos = 58;
            doc.setFontSize(10).setFont('helvetica', 'bold').text('Billed To:', margin, yPos);
            doc.setFont('helvetica', 'normal');
            yPos += 5;
            doc.text(customer.name, margin, yPos);
            yPos += 5;
            const addressLines = doc.splitTextToSize(customer.address || 'No address provided', 80);
            doc.text(addressLines, margin, yPos);
            yPos += (addressLines.length * 5); 
            doc.text(`Phone: ${customer.phone || 'N/A'}`, margin, yPos);
            if (customer.gstin) { yPos += 5; doc.text(`GSTIN: ${customer.gstin}`, margin, yPos); }
            
            let rightYPos = 58;
            doc.setFont('helvetica', 'bold').text('GSTIN: 33DMLPA8598D1ZU', pageWidth - margin, rightYPos, { align: 'right' });
            rightYPos += 8;
            
            const isCredit = orderToPrint.paymentTerm === 'Credit';
            doc.setFontSize(11).setTextColor(isCredit ? 255 : 0, isCredit ? 0 : 128, 0);
            doc.text(isCredit ? 'CREDIT INVOICE' : 'INVOICE', pageWidth - margin, rightYPos, { align: 'right' });
            
            doc.setTextColor(0).setFontSize(10).setFont('helvetica', 'normal');
            rightYPos += 10;
            doc.text(`Invoice No: ${orderToPrint.id.replace('ORD', 'INV')}`, pageWidth - margin, rightYPos, { align: 'right' });
            rightYPos += 5;
            doc.text(`Date: ${new Date(orderToPrint.orderDate).toLocaleDateString('en-IN')}`, pageWidth - margin, rightYPos, { align: 'right' });
			
			// --- PDF TABLE GENERATION ---
            const tableStartY = Math.max(yPos, rightYPos) + 10;
            const tableBody = orderToPrint.items.map(item => {
                // SCRUTINY: Weight-Based Logic aligned with Inventory Categories
                const isSteelOrStick = item.category === 'Rods & Rings' || item.category === 'Savukku Stick';
                
                // Logic: Use manually edited totalWeight if available, 
                // else fallback to calculation, else fallback to quantity.
                const calculationBasis = isSteelOrStick 
                    ? (item.totalWeight ?? (item.quantity * (item.weightPerUnit ?? 0)))
                    : item.quantity;
                
                const baseValue = item.price * calculationBasis;
                const totalValue = orderToPrint.isGstInvoice 
                    ? baseValue * (1 + (item.gst ?? 0) / 100) 
                    : baseValue;

                let description = item.productName;
                if (item.brand) description += ` (Brand: ${item.brand})`;

                return [
                    description,
                    formatQuantity(item),
                    isSteelOrStick ? `${(item.totalWeight ?? 0).toFixed(2)} kg` : 'N/A',
                    formatRate(item),
                    orderToPrint.isGstInvoice ? `${item.gst}%` : 'N/A',
                    formatNumber(totalValue)
                ];
            });

            (doc as any).autoTable({
                startY: tableStartY,
                head: [['Item Description', 'Qty', 'Total Weight', 'Rate', 'GST', 'Total']],
                body: tableBody,
                theme: 'grid',
                headStyles: { fillColor: [204, 229, 255], textColor: [3, 7, 6], fontStyle: 'bold' },
                styles: { cellPadding: 2, fontSize: 8 }, // Smaller font for mobile-heavy data
                columnStyles: {
                    0: { cellWidth: 55 }, 
                    1: { halign: 'center' },
                    2: { halign: 'center' },
                    3: { halign: 'right' },
                    4: { halign: 'center' },
                    5: { halign: 'right' },
                }
            });

            // --- TOTALS SECTION ---
            let finalY = (doc as any).previousAutoTable.finalY + 10;
            const totalsRightColX = pageWidth - margin;
            const totalsLeftColX = totalsRightColX - 50; 
            
            const addTotalRow = (label: string, value: number, isBold = false) => {
                if (isBold) doc.setFont('helvetica', 'bold');
                doc.text(label, totalsLeftColX, finalY, { align: 'right' });
                doc.text(formatNumber(value), totalsRightColX, finalY, { align: 'right' });
                if (isBold) doc.setFont('helvetica', 'normal');
                finalY += 6;
            };

            // Industrial Math Logic: Total = Items + Delivery - Discount
            const currentOrderSubtotal = (orderToPrint.total ?? 0) + (orderToPrint.deliveryFees ?? 0) - (orderToPrint.discount ?? 0);

            addTotalRow("Current Items Total:", orderToPrint.total ?? 0);
            if((orderToPrint.deliveryFees ?? 0) > 0) addTotalRow("Delivery Fees:", orderToPrint.deliveryFees);
            if((orderToPrint.discount ?? 0) > 0) addTotalRow("Discount:", -orderToPrint.discount);
            addTotalRow("Order Subtotal:", currentOrderSubtotal, true);
            
            if((orderToPrint.previousBalance ?? 0) > 0) {
                addTotalRow("Previous Balance:", orderToPrint.previousBalance);
            }

            finalY += 4; 
            const grandTotalText = `Grand Total: ${formatNumber(orderToPrint.grandTotal)}`;
            const isCredit = orderToPrint.paymentTerm === 'Credit';
            
            // Visual Badge for Credit vs Paid
            doc.setFillColor(isCredit ? 255 : 222, isCredit ? 235 : 247, isCredit ? 238 : 236);
            doc.roundedRect(margin, finalY - 5, pageWidth - (margin * 2), 10, 2, 2, 'FD');
            
            doc.setFontSize(11).setFont('helvetica', 'bold')
               .setTextColor(isCredit ? 220 : 22, isCredit ? 38 : 101, isCredit ? 38 : 52)
               .text(grandTotalText, pageWidth/2, finalY, { align: 'center' });
            
            doc.setTextColor(0).setFontSize(8).setFont('helvetica', 'normal');
            const footerY = doc.internal.pageSize.getHeight() - 15;
            doc.text('Thank you for your business!', pageWidth/2, footerY, { align: 'center'});
            doc.text('This is a computer-generated invoice and does not require a signature.', pageWidth/2, footerY + 4, { align: 'center'});

            doc.save(`invoice-${orderToPrint.id.replace('ORD','INV')}.pdf`);
            toast({ title: 'Success', description: 'Invoice PDF Generated.' });
            
        } catch (error) {
            console.error('Scrutiny Error - PDF Generation Failed:', error);
            toast({ title: 'Error', description: 'Failed to generate PDF.', variant: 'destructive'});
        } finally {
            setIsLoading(false);
            setOrderToPrint(null);
        }
    };

    // --- API & DATA PERSISTENCE ---
    const refreshData = async () => {
        try {
            const { orders: refreshedOrders, customers: refreshedCustomers } = await getCoreOrderData();
            setOrders(refreshedOrders);
            setCustomers(refreshedCustomers);
        } catch (e) {
            console.error("Refresh failed:", e);
        }
    }

    const handleAddOrder = async (newOrderData: Omit<Order, 'id' | 'customerName'>) => {
       try {
           const newOrder = await addOrder(newOrderData);
           await refreshData();
           toast({ title: "Order Success", description: `Order ${newOrder.id} placed.` });
           return newOrder;
       } catch (e: any) {
           toast({ title: "Order Failed", description: e.message, variant: "destructive" });
           throw e;
       }
    };

    const handleUpdateOrder = async (updatedOrderData: Order) => {
       try {
           await updateOrder(updatedOrderData);
           await refreshData();
           toast({ title: "Updated", description: `Order ${updatedOrderData.id} saved.` });
       } catch (e: any) {
           toast({ title: "Update Failed", description: e.message, variant: "destructive" });
           throw e;
       }
    };

    const handleDeleteOrder = async () => {
        if (!orderToDelete) return;
        try {
            await deleteOrderFromDB(orderToDelete);
            await refreshData();
            toast({ title: "Deleted", description: `Order ${orderToDelete.id} removed.` });
        } catch (error: any) {
             toast({ title: "Delete Error", description: error.message, variant: "destructive" });
        } finally {
            setOrderToDelete(null);
        }
    }

    const handleExportToExcel = () => {
        const worksheetData = filteredOrders.map(order => ({
            'INV No': order.id.replace('ORD', 'INV'),
            'Customer': order.customerName,
            'Date': new Date(order.orderDate).toLocaleDateString('en-IN'),
            'Status': order.status,
            'Total Amount': order.grandTotal,
            'Payment': order.paymentTerm
        }));
        const worksheet = XLSX.utils.json_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Daily Orders");
        XLSX.writeFile(workbook, `Orders_${new Date().toLocaleDateString()}.xlsx`);
    };
	
	// --- CATEGORY CONSTANTS (Scrutiny: Using exact Inventory strings) ---
const WEIGHT_BASED_CATEGORIES: ProductCategory[] = ['Rods & Rings', 'Savukku Stick'];
const isWeightBased = (category: string) => WEIGHT_BASED_CATEGORIES.includes(category as ProductCategory);

// --- STRICT TYPES FOR ORDER FORM ---
type OrderItemState = { 
    productId: string;
    quantity: string; 
    price: string; 
    cost: string; 
    gst: string; 
    stock: number; 
    calculationType: CalculationType; 
    category: ProductCategory; 
    weightPerUnit: number; 
    totalWeight: string; 
};

const initialItemState: OrderItemState = { 
    productId: '', 
    quantity: '', 
    price: '', 
    cost: '', 
    gst: '', 
    stock: 0, 
    calculationType: 'Per Unit', 
    category: 'General', 
    weightPerUnit: 0, 
    totalWeight: '' 
};

function AddOrderDialog({ 
    isOpen, onOpenChange, customers, products, orders, 
    onOrderAdded, onOrderUpdated, onCustomerAdded, existingOrder 
}: {
    isOpen: boolean,
    onOpenChange: (open: boolean) => void,
    customers: Customer[],
    products: Product[],
    orders: Order[],
    onOrderAdded: (order: Omit<Order, 'id' | 'customerName'>) => Promise<Order>,
    onOrderUpdated: (order: Order) => Promise<void>,
    onCustomerAdded: (customer: Omit<Customer, 'id'|'transactionHistory' | 'orders'>) => Promise<Customer | null>,
    existingOrder: Order | null,
}) {
    // --- UI & CUSTOMER STATE ---
    const [isWalkIn, setIsWalkIn] = useState(false);
    const [walkInName, setWalkInName] = useState('');
    const [walkInPhone, setWalkInPhone] = useState('');
    const [customerId, setCustomerId] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
    
    // --- ITEMS & CART STATE ---
    const [items, setItems] = useState<OrderItemState[]>([]);
    const [currentItem, setCurrentItem] = useState<OrderItemState>(initialItemState);
    const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

    // --- PAYMENT & LOGISTICS ---
    const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>('Full Payment');
    const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
    const [partPaymentAmount, setPartPaymentAmount] = useState<string>('');
    const [paymentRemarks, setPaymentRemarks] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [deliveryDate, setDeliveryDate] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    
    // --- FINANCIAL STATE ---
    const [isGstInvoice, setIsGstInvoice] = useState(true);
    const [enableDiscount, setEnableDiscount] = useState(false);
    const [discount, setDiscount] = useState(0);
    const [deliveryFees, setDeliveryFees] = useState(0);
    const [previousBalance, setPreviousBalance] = useState(0);

    const { toast } = useToast();
    const isEditMode = !!existingOrder;

    // --- FORM RESET LOGIC (Scrutiny: Cleans memory to prevent stale data) ---
    const resetForm = useCallback(() => {
        setCustomerId('');
        setIsWalkIn(false);
        setWalkInName('');
        setWalkInPhone('');
        setOrderDate(new Date().toISOString().split('T')[0]);
        setItems([]);
        setCurrentItem(initialItemState);
        setEditingItemIndex(null);
        setPaymentTerm('Full Payment');
        setPaymentMode('Cash');
        setPartPaymentAmount('');
        setPaymentRemarks('');
        setDueDate('');
        setDeliveryDate('');
        setDeliveryAddress('');
        setIsGstInvoice(true);
        setEnableDiscount(false);
        setDiscount(0);
        setDeliveryFees(0);
        setPreviousBalance(0);
        onOpenChange(false);
    }, [onOpenChange]);
    
    // --- HYDRATION EFFECT (The "Real Mission" Logic) ---
    useEffect(() => {
        if (isOpen && existingOrder) {
            // Check for Walk-In status correctly
            const isOrderWalkIn = !!existingOrder.customerName?.includes('(Walk-In)');
            setIsWalkIn(isOrderWalkIn);

            if (isOrderWalkIn) {
                setWalkInName(existingOrder.customerName.replace(' (Walk-In)', ''));
                const cust = customers.find(c => c.id === existingOrder.customerId);
                setWalkInPhone(cust?.phone || '');
                setCustomerId('');
            } else {
                setCustomerId(existingOrder.customerId);
            }

            setOrderDate(new Date(existingOrder.orderDate).toISOString().split('T')[0]);
            
            // Map items while enforcing strict fallback values
            setItems(existingOrder.items.map(item => {
                const product = products.find(p => p.id === item.productId);
                return {
                    productId: item.productId,
                    quantity: String(item.quantity ?? '0'),
                    price: String(item.price ?? '0'),
                    cost: String(item.cost ?? '0'),
                    gst: String(item.gst ?? '0'),
                    // Restoration Logic: Add current order qty back to stock for editing
                    stock: (product?.stock ?? 0) + (item.quantity ?? 0),
                    calculationType: item.calculationType || (product?.calculationType ?? 'Per Unit'),
                    category: product?.category || 'General',
                    weightPerUnit: product?.weightPerUnit ?? 0,
                    totalWeight: item.totalWeight ? String(item.totalWeight) : ''
                }
            }));
            
            setPaymentTerm(existingOrder.paymentTerm ?? 'Full Payment');
            if (existingOrder.payments?.[0]) {
                setPaymentMode(existingOrder.payments[0].method || 'Cash');
                setPaymentRemarks(existingOrder.payments[0].notes || '');
            }
            
            setDueDate(existingOrder.dueDate ? new Date(existingOrder.dueDate).toISOString().split('T')[0] : '');
            setDeliveryDate(existingOrder.deliveryDate ? new Date(existingOrder.deliveryDate).toISOString().split('T')[0] : '');
            setDeliveryAddress(existingOrder.deliveryAddress || '');
            setIsGstInvoice(!!existingOrder.isGstInvoice);
            setDiscount(existingOrder.discount ?? 0);
            setEnableDiscount((existingOrder.discount ?? 0) > 0);
            setDeliveryFees(existingOrder.deliveryFees ?? 0);
            setPreviousBalance(existingOrder.previousBalance ?? 0);

        } else if (isOpen && !existingOrder) {
            resetForm();
        }
    }, [isOpen, existingOrder, products, customers, resetForm]);
	
	// --- BALANCE FETCHING ENGINE ---
    useEffect(() => {
        const fetchBalance = async () => {
            if (customerId) {
                const customerOrders = orders.filter(o => o.customerId === customerId);
                const hasOrders = customerOrders.length > 0;
                
                // Scrutiny: Determine if this is the customer's very first transaction
                if (isEditMode && existingOrder?.id) {
                    setIsFirstOrder(customerOrders.length === 1 && customerOrders[0].id === existingOrder.id);
                } else {
                    setIsFirstOrder(!hasOrders);
                }

                if (isEditMode && existingOrder) {
                    setPreviousBalance(existingOrder.previousBalance ?? 0);
                } else if (hasOrders) {
                    const balance = await getCustomerBalance(customerId);
                    setPreviousBalance(balance);
                } else {
                    setPreviousBalance(0);
                }
            } else {
                setPreviousBalance(0);
                setIsFirstOrder(false);
            }
        };

        if (isOpen) fetchBalance();
    }, [customerId, orders, isOpen, isEditMode, existingOrder]);

    // --- ITEM SELECTION & CART LOGIC ---
    const handleProductSelect = (productId: string) => {
        const product = products.find(p => p.id === productId);
        if (product) {
            setCurrentItem({
                productId: product.id,
                quantity: '',
                price: String(product.salePrice || 0),
                cost: String(product.costPrice || 0),
                gst: String(product.gst || 0),
                stock: product.stock,
                calculationType: product.calculationType || 'Per Unit',
                category: product.category || 'General',
                weightPerUnit: product.weightPerUnit || 0,
                totalWeight: '' // Ready for manual override
            });
        }
    };
    
    const handleAddItem = () => {
        if (!currentItem.productId) {
            toast({ title: 'Selection Missing', description: 'Please select an item first.', variant: 'destructive' });
            return;
        }

        const qty = parseFloat(currentItem.quantity);
        if (isNaN(qty) || qty <= 0) {
            toast({ title: 'Invalid Qty', description: 'Enter a valid quantity.', variant: 'destructive' });
            return;
        }

        if (qty > currentItem.stock) {
            toast({ title: 'Stock Alert', description: `Only ${currentItem.stock} available.`, variant: 'destructive' });
            return;
        }
        setItems([...items, currentItem]);
        setCurrentItem(initialItemState);
    };

    // --- THE INDUSTRIAL MATH ENGINE (useMemo) ---
    const { currentInvoiceTotal, subTotal, grandTotal } = useMemo(() => {
        const currentItemsTotal = items.reduce((sum, item) => {
            const price = parseFloat(item.price) || 0;
            const quantity = parseFloat(item.quantity) || 0;
            
            // SCRUTINY: The Weight-Based Calculation Logic
            if (isWeightBased(item.category)) {
                const totalWeight = parseFloat(item.totalWeight) || (quantity * (item.weightPerUnit || 0));
                return sum + (price * totalWeight);
            }
            return sum + (price * quantity);
        }, 0);
        
        const totalGst = isGstInvoice ? items.reduce((sum, item) => {
            const price = parseFloat(item.price) || 0;
            const quantity = parseFloat(item.quantity) || 0;
            const gstPercent = parseFloat(item.gst) || 0;
            
            let lineTotal = 0;
            if (isWeightBased(item.category)) {
                const weight = parseFloat(item.totalWeight) || (quantity * (item.weightPerUnit || 0));
                lineTotal = price * weight;
            } else {
                lineTotal = price * quantity;
            }
            return sum + (lineTotal * (gstPercent / 100));
        }, 0) : 0;
        
        const invTotal = currentItemsTotal + totalGst;
        const sub = invTotal + (deliveryFees || 0) - (discount || 0);
        const grand = sub + (previousBalance || 0);

        return { 
            currentInvoiceTotal: invTotal, 
            subTotal: sub, 
            grandTotal: grand 
        };
    }, [items, isGstInvoice, deliveryFees, discount, previousBalance]);
	
	// --- BALANCE & STATUS ENGINE ---
    useEffect(() => {
        const fetchBalance = async () => {
            if (customerId) {
                const customerOrders = orders.filter(o => o.customerId === customerId);
                const hasOrders = customerOrders.length > 0;
                
                // Determine if this is a brand new customer or a repeat one
                if (isEditMode && existingOrder?.id) {
                    setIsFirstOrder(customerOrders.length === 1 && customerOrders[0].id === existingOrder.id);
                } else {
                    setIsFirstOrder(!hasOrders);
                }

                if (isEditMode && existingOrder) {
                    setPreviousBalance(existingOrder.previousBalance ?? 0);
                } else if (hasOrders) {
                    const balance = await getCustomerBalance(customerId);
                    setPreviousBalance(balance);
                } else {
                    setPreviousBalance(0);
                }
            } else {
                setPreviousBalance(0);
                setIsFirstOrder(false);
            }
        };

        if (isOpen) fetchBalance();
    }, [customerId, orders, isOpen, isEditMode, existingOrder]);

    // --- ITEM SELECTION LOGIC ---
    const handleProductSelect = (productId: string) => {
        const product = products.find(p => p.id === productId);
        if (product) {
            setCurrentItem({
                productId: product.id,
                quantity: '',
                price: String(product.salePrice || 0),
                cost: String(product.costPrice || 0),
                gst: String(product.gst || 0),
                stock: product.stock,
                calculationType: product.calculationType || 'Per Unit',
                category: product.category || 'General',
                weightPerUnit: product.weightPerUnit || 0,
                totalWeight: '' // Defaults to empty so auto-calculation can trigger
            });
        }
    };
    
    // --- CART ACTIONS ---
    const handleAddItem = () => {
        if (!currentItem.productId) {
            toast({ title: 'Selection Missing', description: 'Please select an item first.', variant: 'destructive' });
            return;
        }

        const qty = parseFloat(currentItem.quantity);
        if (isNaN(qty) || qty <= 0) {
            toast({ title: 'Invalid Qty', description: 'Enter a valid quantity.', variant: 'destructive' });
            return;
        }

        if (qty > currentItem.stock) {
            toast({ title: 'Stock Alert', description: `Only ${currentItem.stock} available in inventory.`, variant: 'destructive' });
            return;
        }
        setItems([...items, currentItem]);
        setCurrentItem(initialItemState);
    };

    // --- INDUSTRIAL MATH ENGINE ---
    const { currentInvoiceTotal, subTotal, grandTotal } = useMemo(() => {
        const currentItemsTotal = items.reduce((sum, item) => {
            const price = parseFloat(item.price) || 0;
            const quantity = parseFloat(item.quantity) || 0;
            
            if (isWeightBased(item.category)) {
                // Logic: Manual weight takes priority, otherwise use (Qty * WeightPerUnit)
                const totalWeight = parseFloat(item.totalWeight) || (quantity * (item.weightPerUnit || 0));
                return sum + (price * totalWeight);
            }
            return sum + (price * quantity);
        }, 0);
        
        const totalGst = isGstInvoice ? items.reduce((sum, item) => {
            const price = parseFloat(item.price) || 0;
            const quantity = parseFloat(item.quantity) || 0;
            const gstPercent = parseFloat(item.gst) || 0;
            
            let lineBaseTotal = 0;
            if (isWeightBased(item.category)) {
                const weight = parseFloat(item.totalWeight) || (quantity * (item.weightPerUnit || 0));
                lineBaseTotal = price * weight;
            } else {
                lineBaseTotal = price * quantity;
            }
            return sum + (lineBaseTotal * (gstPercent / 100));
        }, 0) : 0;
        
        const invTotal = currentItemsTotal + totalGst;
        const sub = invTotal + (deliveryFees || 0) - (discount || 0);
        const grand = sub + (previousBalance || 0);

        // Final Scrutiny rounding to ensure currency precision
        return { 
            currentInvoiceTotal: Math.round(invTotal * 100) / 100, 
            subTotal: Math.round(sub * 100) / 100, 
            grandTotal: Math.round(grand * 100) / 100 
        };
    }, [items, isGstInvoice, deliveryFees, discount, previousBalance]);
	
	    // --- RENDER BLOCK ---
    if (!isMounted) return <div className="p-6 space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-40 w-full" /></div>;

    return (
        <div className="container mx-auto space-y-6 p-2 sm:p-6">
		
		{/* --- PREVIOUS BALANCE DISPLAY --- */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {isFirstOrder && !isEditMode && (
        <div className="space-y-2">
            <Label htmlFor="previous_balance">Opening Balance (Optional)</Label>
            <Input
                id="previous_balance"
                type="number"
                placeholder="0.00"
                value={String(previousBalance)}
                onChange={(e) => setPreviousBalance(parseFloat(e.target.value) || 0)}
                className="border-amber-200 focus:ring-amber-500"
            />
        </div>
    )}
    {previousBalance > 0 && !isFirstOrder && (
        <div className="flex items-center justify-start">
            <div className="w-full md:w-auto p-3 bg-amber-50 border border-amber-200 rounded-lg shadow-sm">
                <div className="text-[10px] uppercase font-bold text-amber-600">Outstanding Balance</div>
                <div className="text-lg font-bold text-amber-900">{formatNumberForDisplay(previousBalance)}</div>
            </div>
        </div>
    )}
</div>

{/* --- PAYMENT TERM SELECTOR --- */}
<div className="space-y-4 pt-2">
    <div className="flex items-center space-x-2 bg-slate-50 p-2 rounded-md border border-dashed">
        <Checkbox
            id="is_gst_invoice"
            checked={isGstInvoice}
            onCheckedChange={(c) => setIsGstInvoice(c as boolean)}
        />
        <Label htmlFor="is_gst_invoice" className="cursor-pointer font-medium">Apply GST (18%) to this Invoice</Label>
    </div>

    <div className="space-y-3">
        <Label className="text-sm font-bold text-slate-700">Payment Terms</Label>
        <RadioGroup
            value={paymentTerm}
            onValueChange={(v) => setPaymentTerm(v as PaymentTerm)}
            className="flex flex-wrap gap-4"
        >
            <div className="flex items-center space-x-2"><RadioGroupItem value="Full Payment" id="full_payment" /><Label htmlFor="full_payment">Full Paid</Label></div>
            <div className="flex items-center space-x-2"><RadioGroupItem value="Part Payment" id="part_payment" /><Label htmlFor="part_payment" className="text-blue-600">Part Payment</Label></div>
            <div className="flex items-center space-x-2"><RadioGroupItem value="Credit" id="credit" /><Label htmlFor="credit" className="text-red-600">Credit</Label></div>
        </RadioGroup>

        {/* Part Payment Input */}
        {paymentTerm === 'Part Payment' && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg animate-in slide-in-from-top-2">
                <Label htmlFor="part_amt" className="text-[10px] uppercase font-bold text-blue-700">Advance Received Now</Label>
                <Input
                    id="part_amt"
                    type="number"
                    value={partPaymentAmount}
                    onChange={(e) => setPartPaymentAmount(e.target.value)}
                    className="bg-white border-blue-300 text-lg font-bold mt-1"
                    placeholder="0"
                />
            </div>
        )}
    </div>
</div>

{/* --- DYNAMIC PRODUCT ENTRY (THE MISSION CRITICAL PART) --- */}
<Card className="border-2 border-primary/10 shadow-md">
    <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Add Items to Order</h3>
            <Badge variant="outline" className="text-[10px]">{currentItem.category}</Badge>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label className="text-xs">Select Product</Label>
                <Combobox
                    options={productOptions}
                    value={currentItem.productId}
                    onValueChange={handleProductSelect}
                    placeholder="Search Products..."
                />
            </div>
            
            <div className="col-span-6 md:col-span-2 space-y-1.5">
                <Label className="text-xs">{isWeightBased(currentItem.category) ? 'Qty (Nos)' : 'Quantity'}</Label>
                <Input
                    type="number"
                    value={currentItem.quantity}
                    onChange={(e) => setCurrentItem({ ...currentItem, quantity: e.target.value })}
                    placeholder="0"
                />
            </div>

            {/* SCRUTINY: Weight Override Input for Rods & Rings */}
            {isWeightBased(currentItem.category) && (
                <div className="col-span-6 md:col-span-2 space-y-1.5 animate-in fade-in slide-in-from-left-2">
                    <Label className="text-xs text-blue-600 font-bold">Total Weight (Kg)</Label>
                    <Input
                        type="number"
                        placeholder={(parseFloat(currentItem.quantity || "0") * currentItem.weightPerUnit).toFixed(2)}
                        value={currentItem.totalWeight}
                        onChange={(e) => setCurrentItem({ ...currentItem, totalWeight: e.target.value })}
                        className="border-blue-300 focus:ring-blue-500 bg-blue-50/30"
                    />
                </div>
            )}

            <div className="col-span-6 md:col-span-2 space-y-1.5">
                <Label className="text-xs">Rate</Label>
                <Input
                    type="number"
                    value={currentItem.price}
                    onChange={(e) => setCurrentItem({ ...currentItem, price: e.target.value })}
                />
            </div>

            <div className="col-span-12 md:col-span-2">
                <Button 
                    type="button" 
                    className="w-full" 
                    onClick={editingItemIndex !== null ? handleUpdateItem : handleAddItem}
                >
                    {editingItemIndex !== null ? 'Update' : 'Add'}
                </Button>
            </div>
        </div>
    </CardContent>
</Card>

{/* --- ORDER ITEMS TABLE --- */}
<div className="rounded-lg border bg-white shadow-sm overflow-hidden">
    <ScrollArea className="w-full">
        <Table>
            <TableHeader className="bg-slate-50">
                <TableRow>
                    <TableHead className="w-[40%]">Item</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Line Total</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {items.map((item, index) => {
                    const price = parseFloat(item.price) || 0;
                    const qty = parseFloat(item.quantity) || 0;
                    const weight = isWeightBased(item.category) 
                        ? (parseFloat(item.totalWeight) || (qty * item.weightPerUnit))
                        : qty;
                    const lineTotal = price * weight;

                    return (
                        <TableRow key={index} className="group">
                            <TableCell className="font-medium">
                                {products.find(p => p.id === item.productId)?.name}
                                {isWeightBased(item.category) && (
                                    <div className="text-[10px] text-blue-600 font-semibold">
                                        Total Weight: {weight.toFixed(2)} kg
                                    </div>
                                )}
                            </TableCell>
                            <TableCell className="text-center">{item.quantity}</TableCell>
                            <TableCell className="text-right">{formatNumberForDisplay(price)}</TableCell>
                            <TableCell className="text-right font-bold text-slate-900">{formatNumberForDisplay(lineTotal)}</TableCell>
                            <TableCell className="text-center space-x-1">
                                <Button type="button" size="icon" variant="ghost" onClick={() => handleEditItemClick(index)} className="h-7 w-7"><Edit className="h-3 w-3" /></Button>
                                <Button type="button" size="icon" variant="ghost" onClick={() => handleRemoveItem(index)} className="h-7 w-7 text-red-500"><Trash2 className="h-3 w-3" /></Button>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    </ScrollArea>
</div>
					{/* --- DELIVERY & SUMMARY SECTION --- */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                
                {/* 1. Delivery Details Card */}
                <Card className="shadow-sm border-slate-200">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">Logistics Info</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="deliveryDate">Expected Delivery Date</Label>
                            <Input
                                id="deliveryDate"
                                type="date"
                                value={deliveryDate}
                                onChange={(e) => setDeliveryDate(e.target.value)}
                                className="focus:ring-primary"
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <Label htmlFor="deliveryAddress" className="flex justify-between">
                                Delivery Address 
                                <span className="text-[10px] text-red-500 font-bold uppercase">* Required</span>
                            </Label>
                            <Textarea
                                id="deliveryAddress"
                                value={deliveryAddress}
                                onChange={(e) => setDeliveryAddress(e.target.value)}
                                placeholder="Enter full site address..."
                                className={cn(
                                    "min-h-[100px] resize-none",
                                    !deliveryAddress && "border-red-200 focus-visible:ring-red-500"
                                )}
                                required
                            />
                            {!deliveryAddress && (
                                <p className="text-[10px] text-red-500 italic">Order cannot be submitted without a delivery address.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Final Order Summary Card */}
                <Card className="bg-slate-50/50 border-primary/20 shadow-inner">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">Billing Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Current Items Total (Incl. GST):</span>
                            <span className="font-semibold text-slate-900">{formatNumberForDisplay(currentInvoiceTotal)}</span>
                        </div>

                        <div className="flex justify-between items-center text-sm">
                            <Label htmlFor="delivery_fees" className="text-slate-600">Delivery / Transport Fees</Label>
                            <div className="relative">
                                <span className="absolute left-2 top-1.5 text-slate-400 text-xs">₹</span>
                                <Input
                                    id="delivery_fees"
                                    type="number"
                                    className="w-28 h-8 pl-5 text-right font-medium"
                                    value={String(deliveryFees)}
                                    onChange={(e) => setDeliveryFees(parseFloat(e.target.value) || 0)}
                                />
                            </div>
                        </div>

                        <div className="flex justify-between items-center text-sm">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="enable_discount"
                                    checked={enableDiscount}
                                    onCheckedChange={(c) => setEnableDiscount(c as boolean)}
                                />
                                <Label htmlFor="enable_discount" className="text-slate-600">Special Discount</Label>
                            </div>
                            <div className="relative">
                                <span className="absolute left-2 top-1.5 text-slate-400 text-xs">-₹</span>
                                <Input
                                    id="discount"
                                    type="number"
                                    className="w-28 h-8 pl-6 text-right font-medium text-green-600"
                                    value={String(discount)}
                                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                                    disabled={!enableDiscount}
                                />
                            </div>
                        </div>

                        <Separator className="bg-slate-200" />

                        <div className="flex justify-between text-sm py-1">
                            <span className="font-medium text-slate-700">Order Subtotal:</span>
                            <span className="font-bold text-slate-900">{formatNumberForDisplay(subTotal)}</span>
                        </div>

                        {previousBalance > 0 && (
                            <div className="flex justify-between text-amber-700 text-sm italic">
                                <span>Add: Previous Outstanding Balance:</span>
                                <span className="font-bold">{formatNumberForDisplay(previousBalance)}</span>
                            </div>
                        )}

                        <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-xl flex justify-between items-center">
                            <span className="text-lg font-black text-slate-800 uppercase tracking-tight">Grand Total</span>
                            <span className="text-2xl font-black text-primary">{formatNumberForDisplay(grandTotal)}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* --- FORM SUBMISSION FOOTER --- */}
            <DialogFooter className="sticky bottom-0 p-4 border-t bg-white/80 backdrop-blur-md mt-6 flex-col sm:flex-row gap-3">
                <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={() => onOpenChange(false)}
                    className="w-full sm:w-auto"
                >
                    Cancel
                </Button>
                <Button 
                    type="submit" 
                    disabled={items.length === 0 || !deliveryAddress}
                    className="w-full sm:min-w-[200px] shadow-lg shadow-primary/20"
                >
                    {isEditMode ? 'Update & Save Changes' : 'Confirm & Place Order'}
                </Button>
            </DialogFooter>
        </form>
    </ScrollArea>
</DialogContent>