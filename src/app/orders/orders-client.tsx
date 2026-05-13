'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Order, Customer, Product, PaymentTerm, PaymentMode, CalculationType, ProductCategory, OrderItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, FileText, PlusCircle, Trash2, Edit, Share2, FileSpreadsheet, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/ui/combobox';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { UserOptions } from 'jspdf-autotable';

// --- TYPES & INTERFACES ---
interface jsPDFWithPlugin extends jsPDF {
    autoTable: (options: UserOptions) => jsPDF;
    previousAutoTable: { finalY: number };
}

type OrderItemState = { 
    productId: string; quantity: string; price: string; cost: string; gst: string; 
    stock: number; calculationType: CalculationType; category: ProductCategory; 
    weightPerUnit: number; totalWeight: string; 
};

const WEIGHT_BASED_CATEGORIES: string[] = ['Rings', 'Rods', 'Steel', 'Rods & Rings', 'Savukku Stick'];
const isWeightBased = (category: string) => WEIGHT_BASED_CATEGORIES.includes(category);
const initialItemState: OrderItemState = { 
    productId: '', quantity: '', price: '', cost: '', gst: '', stock: 0, 
    calculationType: 'Per Unit', category: 'General', weightPerUnit: 0, totalWeight: '' 
};

const formatINR = (val: number | undefined) => `INR ${(val ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OrdersClient({ orders: initialOrders, customers: initialCustomers, products: initialProducts }: { orders: Order[], customers: Customer[], products: Product[] }) {
    const [orders, setOrders] = useState<Order[]>(initialOrders);
    const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [isLoading, setIsLoading] = useState(false);
    const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);
    const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);
    const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
    const [orderToEdit, setOrderToEdit] = useState<Order | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState('All');
    const [isMounted, setIsMounted] = useState(false);
    const { toast } = useToast();

    useEffect(() => { setIsMounted(true); }, []);

    // --- REFRESH DATA HOOK ---
    const refreshData = async () => {
        const data = await getCoreOrderData();
        setOrders(data.orders);
        setCustomers(data.customers);
    };

    const filteredOrders = useMemo(() => {
        return orders.filter(o => 
            o.status !== 'Deleted' && 
            (o.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
             o.customerName.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }, [orders, searchQuery]);

    useEffect(() => { if (orderToPrint) handlePrint(); }, [orderToPrint]);

    const handlePrint = async () => {
        if (!orderToPrint) return;
        setIsLoading(true);
        try {
            const doc = new jsPDF() as jsPDFWithPlugin;
            doc.setFontSize(14).text("AB AGENCY - INVOICE", 105, 20, { align: 'center' });
            // ... (PDF logic implementation)
            doc.save(`INV-${orderToPrint.id}.pdf`);
        } catch (e) { toast({ title: "Print Failed" }); }
        finally { setIsLoading(false); setOrderToPrint(null); }
    };

    if (!isMounted) return <Skeleton className="h-96 w-full" />;

    return (
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Orders</h1>
                <Button onClick={() => setIsAddOrderOpen(true)}><PlusCircle className="mr-2 h-4 w-4" /> Place Order</Button>
            </div>

            {/* --- SEARCH & FILTERS BOX --- */}
            <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-lg border shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search by ID or Customer..." 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        className="pl-9"
                    />
                </div>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Date Filter" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">All Orders</SelectItem>
                        <SelectItem value="Today">Today</SelectItem>
                        <SelectItem value="This Week">This Week</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="rounded-md border bg-white overflow-x-auto shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Order ID</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredOrders.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No orders found.</TableCell></TableRow>
                        ) : filteredOrders.map(order => (
                            <TableRow key={order.id}>
                                <TableCell className="font-bold">{order.id}</TableCell>
                                <TableCell>{order.customerName}</TableCell>
                                <TableCell>{new Date(order.orderDate).toLocaleDateString('en-IN')}</TableCell>
                                <TableCell className="text-right font-semibold">{formatINR(order.grandTotal)}</TableCell>
                                <TableCell className="text-center">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost"><MoreHorizontal /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => setOrderToEdit(order)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setOrderToPrint(order)}><FileText className="mr-2 h-4 w-4" /> Invoice</DropdownMenuItem>
                                            <DropdownMenuItem 
                                                onClick={async () => { 
                                                    await deleteOrderFromDB(order); 
                                                    await refreshData();
                                                    toast({ title: "Order Deleted" });
                                                }} 
                                                className="text-red-600"
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <AddOrderDialog
                isOpen={isAddOrderOpen || !!orderToEdit}
                onOpenChange={(open) => { if (!open) { setIsAddOrderOpen(false); setOrderToEdit(null); } }}
                customers={customers}
                products={products}
                onOrderAdded={async (d) => { await addOrder(d); await refreshData(); }}
                onOrderUpdated={async (d) => { await updateOrder(d); await refreshData(); }}
                onCustomerAdded={async (d) => { 
                    const c = await addCustomer(d); 
                    await refreshData(); // Forces "Customers" section to update
                    return c; 
                }}
                existingOrder={orderToEdit}
            />
        </div>
    );
}

function AddOrderDialog({ isOpen, onOpenChange, customers, products, onOrderAdded, onOrderUpdated, onCustomerAdded, existingOrder }: any) {
    const [isWalkIn, setIsWalkIn] = useState(false);
    const [walkInName, setWalkInName] = useState('');
    const [walkInPhone, setWalkInPhone] = useState('');
    const [customerId, setCustomerId] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<OrderItemState[]>([]);
    const [currentItem, setCurrentItem] = useState<OrderItemState>(initialItemState);
    const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>('Full Payment');
    const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
    const [partPaymentAmount, setPartPaymentAmount] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [isGstInvoice, setIsGstInvoice] = useState(false);

    const isEditMode = !!existingOrder;

    const resetForm = useCallback(() => {
        setIsWalkIn(false); setWalkInName(''); setWalkInPhone(''); setCustomerId('');
        setItems([]); setCurrentItem(initialItemState); setDeliveryAddress('');
        setIsGstInvoice(false); setPartPaymentAmount('');
    }, []);

    useEffect(() => {
        if (isOpen && existingOrder) {
            const isWI = existingOrder.customerName.includes('(Walk-In)');
            setIsWalkIn(isWI);
            setCustomerId(isWI ? '' : existingOrder.customerId);
            if (isWI) setWalkInName(existingOrder.customerName.replace(' (Walk-In)', ''));
            setOrderDate(new Date(existingOrder.orderDate).toISOString().split('T')[0]);
            setItems(existingOrder.items.map((i: any) => ({ ...i, quantity: String(i.quantity), price: String(i.price) })));
            setDeliveryAddress(existingOrder.deliveryAddress || '');
            setPaymentTerm(existingOrder.paymentTerm);
        } else if (isOpen) { resetForm(); }
    }, [isOpen, existingOrder, resetForm]);

    const math = useMemo(() => {
        const base = items.reduce((sum, i) => sum + (parseFloat(i.price) * parseFloat(i.quantity)), 0);
        return { total: base, grand: base };
    }, [items]);

    const canSubmit = items.length > 0 && (isWalkIn ? walkInName.length > 0 : customerId.length > 0);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl h-[92vh] flex flex-col p-0 overflow-hidden outline-none">
                <DialogHeader className="p-4 border-b bg-slate-50"><DialogTitle>{isEditMode ? 'Edit Order' : 'New Order'}</DialogTitle></DialogHeader>
                <ScrollArea className="flex-1 p-6" onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') e.currentTarget.scrollBy(0, 40);
                    if (e.key === 'ArrowUp') e.currentTarget.scrollBy(0, -40);
                }}>
                    <form className="space-y-6" onSubmit={async (e) => {
                        e.preventDefault();
                        const data = {
                            customerId: isWalkIn ? 'walk-in-temp' : customerId,
                            customerName: isWalkIn ? `${walkInName} (Walk-In)` : customers.find((c: any) => c.id === customerId)?.name,
                            orderDate: new Date(orderDate).toISOString(),
                            items: items.map(i => ({ ...i, quantity: parseFloat(i.quantity), price: parseFloat(i.price) })),
                            grandTotal: math.grand, paymentTerm, deliveryAddress, isGstInvoice,
                            status: paymentTerm === 'Full Payment' ? 'Fulfilled' : 'Pending'
                        };
                        isEditMode ? await onOrderUpdated({ ...existingOrder, ...data }) : await onOrderAdded(data);
                        onOpenChange(false);
                    }}>
                        {/* --- FORM FIELDS --- */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card className="p-4 space-y-4 shadow-none">
                                <Label className="font-bold underline">1. CUSTOMER INFO</Label>
                                <RadioGroup value={isWalkIn ? 'wi' : 'ex'} onValueChange={(v) => setIsWalkIn(v === 'wi')} className="flex gap-4 pb-2">
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="ex" id="ex" /><Label htmlFor="ex">Regular</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="wi" id="wi" /><Label htmlFor="wi" className="text-blue-600 font-bold">New Customer</Label></div>
                                </RadioGroup>
                                {isWalkIn ? (
                                    <div className="grid grid-cols-2 gap-2 animate-in fade-in">
                                        <Input placeholder="Full Name" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} required />
                                        <Input placeholder="Phone (Optional)" value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} />
                                    </div>
                                ) : (
                                    <Combobox options={customers.map((c: any) => ({ value: c.id, label: c.name }))} value={customerId} onValueChange={setCustomerId} />
                                )}
                            </Card>
                            <Card className="p-4 space-y-4 shadow-none">
                                <Label className="font-bold underline">2. DATE & GST</Label>
                                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                                <div className="flex items-center space-x-2"><Checkbox id="gst" checked={isGstInvoice} onCheckedChange={(v) => setIsGstInvoice(!!v)} /><Label htmlFor="gst">This is a GST Invoice</Label></div>
                            </Card>
                        </div>
                        {/* ... Rest of Product Selection logic ... */}
                        <DialogFooter className="p-4 border-t bg-white gap-2 mt-4"><Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!canSubmit} className="bg-blue-600 text-white hover:bg-blue-700">Confirm & Save Order</Button></DialogFooter>
                    </form>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}