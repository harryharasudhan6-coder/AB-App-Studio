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
    const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
    const [searchQuery, setSearchQuery] = useState('');
    const [isMounted, setIsMounted] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setIsMounted(true);
        const savedLogo = localStorage.getItem('companyLogo');
        if (savedLogo) setLogoUrl(savedLogo);
    }, []);

    const refreshData = async () => {
        const data = await getCoreOrderData();
        setOrders(data.orders);
        setCustomers(data.customers);
    };

    useEffect(() => { if (orderToPrint) handlePrint(); }, [orderToPrint]);

    const handlePrint = async () => {
        if (!orderToPrint) return;
        const customer = customers.find(c => c.id === orderToPrint.customerId) || { name: orderToPrint.customerName, address: orderToPrint.deliveryAddress };
        setIsLoading(true);
        try {
            const doc = new jsPDF() as jsPDFWithPlugin;
            const margin = 14;
            const pageWidth = doc.internal.pageSize.getWidth();

            if (logoUrl) { try { doc.addImage(logoUrl, 'PNG', pageWidth/2 - 12.5, 15, 25, 20); } catch (e) {} }
            doc.setFontSize(9).text('AB AGENCY - No.1, Ayyanchery main road, Chennai - 603210', pageWidth/2, 40, { align: 'center' });
            doc.line(margin, 48, pageWidth - margin, 48);

            doc.setFontSize(10).setFont('helvetica', 'bold').text('Billed To:', margin, 58);
            doc.setFont('helvetica', 'normal').text([customer.name, (customer as any).address || 'N/A'], margin, 63);

            let statusColor: [number, number, number] = [0, 128, 0];
            let statusText = "FULL PAYMENT";
            if (orderToPrint.paymentTerm === 'Credit') { statusColor = [200, 0, 0]; statusText = "CREDIT"; }
            else if (orderToPrint.paymentTerm === 'Part Payment') { statusColor = [0, 0, 255]; statusText = "PART PAYMENT"; }

            doc.setFontSize(11).setTextColor(...statusColor).setFont('helvetica', 'bold').text(statusText, pageWidth - margin, 66, { align: 'right' });
            doc.setTextColor(0).setFontSize(10).text([`INV: ${orderToPrint.id.replace('ORD', 'INV')}`, `Date: ${new Date(orderToPrint.orderDate).toLocaleDateString('en-IN')}`], pageWidth - margin, 74, { align: 'right' });

            const tableBody = orderToPrint.items.map(item => [
                item.productName,
                `${item.quantity} ${isWeightBased(item.category) ? 'nos' : 'pcs'}`,
                isWeightBased(item.category) ? `${(item.totalWeight ?? 0).toFixed(2)} kg` : 'N/A',
                formatINR(item.price),
                formatINR(item.price * (item.totalWeight || item.quantity))
            ]);

            (doc as any).autoTable({ startY: 90, head: [['Description', 'Qty', 'Weight', 'Rate', 'Total']], body: tableBody, theme: 'grid', headStyles: { fillColor: [204, 229, 255], textColor: [0, 0, 0] } });
            doc.save(`INV-${orderToPrint.id}.pdf`);
        } catch (e) { toast({ title: "PDF Error" }); }
        finally { setIsLoading(false); setOrderToPrint(null); }
    };

    if (!isMounted) return <Skeleton className="h-96 w-full" />;

    return (
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Orders</h1>
                <Button onClick={() => setIsAddOrderOpen(true)}><PlusCircle className="mr-2 h-4 w-4" /> Place Order</Button>
            </div>

            <div className="relative max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search orders..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
            </div>

            <div className="rounded-md border bg-white overflow-x-auto shadow-sm">
                <Table>
                    <TableHeader><TableRow><TableHead>Order ID</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Grand Total</TableHead><TableHead className="text-center">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {orders.filter(o => o.id.toLowerCase().includes(searchQuery.toLowerCase()) || o.customerName.toLowerCase().includes(searchQuery.toLowerCase())).map(order => (
                            <TableRow key={order.id}>
                                <TableCell className="font-bold">{order.id}</TableCell>
                                <TableCell>{order.customerName}</TableCell>
                                <TableCell className="text-right font-semibold">{formatINR(order.grandTotal)}</TableCell>
                                <TableCell className="text-center">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost"><MoreHorizontal /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => setOrderToEdit(order)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setOrderToPrint(order)}><FileText className="mr-2 h-4 w-4" /> Invoice</DropdownMenuItem>
                                            <DropdownMenuItem onClick={async () => { await deleteOrderFromDB(order); await refreshData(); }} className="text-red-600"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
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
                onOrderAdded={async (d: any) => { await addOrder(d); await refreshData(); }}
                onOrderUpdated={async (d: any) => { await updateOrder(d); await refreshData(); }}
                onCustomerAdded={async (d: any) => { const c = await addCustomer(d); await refreshData(); return c; }}
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
    const [deliveryDate, setDeliveryDate] = useState('');
    const [isGstInvoice, setIsGstInvoice] = useState(false);
    const [deliveryFees, setDeliveryFees] = useState(0);
    const [previousBalance, setPreviousBalance] = useState(0);

    const isEditMode = !!existingOrder;

    const resetForm = useCallback(() => {
        setIsWalkIn(false); setWalkInName(''); setWalkInPhone(''); setCustomerId('');
        setOrderDate(new Date().toISOString().split('T')[0]); setItems([]);
        setCurrentItem(initialItemState); setDeliveryAddress(''); setDeliveryFees(0); 
        setPreviousBalance(0); setDeliveryDate(''); setIsGstInvoice(false); setPartPaymentAmount('');
    }, []);

    useEffect(() => {
        if (isOpen && existingOrder) {
            const isWI = existingOrder.customerName.includes('(Walk-In)');
            setIsWalkIn(isWI);
            setCustomerId(isWI ? '' : existingOrder.customerId);
            if (isWI) setWalkInName(existingOrder.customerName.replace(' (Walk-In)', ''));
            setOrderDate(new Date(existingOrder.orderDate).toISOString().split('T')[0]);
            setItems(existingOrder.items.map((i: any) => ({ ...i, quantity: String(i.quantity), price: String(i.price), totalWeight: i.totalWeight ? String(i.totalWeight) : '' })));
            setDeliveryAddress(existingOrder.deliveryAddress || '');
            setDeliveryDate(existingOrder.deliveryDate ? new Date(existingOrder.deliveryDate).toISOString().split('T')[0] : '');
            setPaymentTerm(existingOrder.paymentTerm);
            setPreviousBalance(existingOrder.previousBalance || 0);
            setIsGstInvoice(existingOrder.isGstInvoice ?? false);
        } else if (isOpen) { resetForm(); }
    }, [isOpen, existingOrder, resetForm]);

    useEffect(() => {
        if (customerId && !isEditMode) getCustomerBalance(customerId).then(setPreviousBalance);
    }, [customerId, isEditMode]);

    const math = useMemo(() => {
        const base = items.reduce((sum, i) => {
            const q = parseFloat(i.quantity) || 0;
            const p = parseFloat(i.price) || 0;
            const w = isWeightBased(i.category) ? (parseFloat(i.totalWeight) || (q * i.weightPerUnit)) : q;
            const line = p * w;
            return sum + line + (isGstInvoice ? line * (parseFloat(i.gst) / 100) : 0);
        }, 0);
        return { total: base, grand: base + deliveryFees + previousBalance };
    }, [items, isGstInvoice, deliveryFees, previousBalance]);

    const canSubmit = items.length > 0 && (isWalkIn ? walkInName.length > 0 : customerId.length > 0);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl h-[92vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-4 border-b bg-slate-50"><DialogTitle>{isEditMode ? 'Edit Order' : 'New Order'}</DialogTitle></DialogHeader>
                <ScrollArea className="flex-1 p-6">
                    <form className="space-y-6" onSubmit={async (e) => {
                        e.preventDefault();
                        const data = {
                            customerId: isWalkIn ? 'walk-in-temp' : customerId,
                            customerName: isWalkIn ? `${walkInName} (Walk-In)` : customers.find((c: any) => c.id === customerId)?.name,
                            orderDate: new Date(orderDate).toISOString(),
                            deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : null,
                            items: items.map(i => ({ ...i, quantity: parseFloat(i.quantity), price: parseFloat(i.price), totalWeight: parseFloat(i.totalWeight) || 0 })),
                            total: math.total, grandTotal: math.grand, previousBalance, deliveryFees, paymentTerm, deliveryAddress, isGstInvoice,
                            payments: paymentTerm === 'Full Payment' ? [{amount: math.grand, date: new Date().toISOString(), mode: paymentMode}] : (parseFloat(partPaymentAmount) > 0 ? [{amount: parseFloat(partPaymentAmount), date: new Date().toISOString(), mode: paymentMode}] : []),
                            status: paymentTerm === 'Full Payment' ? 'Fulfilled' : 'Pending'
                        };
                        isEditMode ? await onOrderUpdated({ ...existingOrder, ...data }) : await onOrderAdded(data);
                        onOpenChange(false);
                    }}>
                        {/* 1. CUSTOMER INFO & DATE */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card className="p-4 space-y-4 shadow-sm">
                                <Label className="font-bold underline">1. CUSTOMER INFO</Label>
                                <RadioGroup value={isWalkIn ? 'wi' : 'ex'} onValueChange={(v) => setIsWalkIn(v === 'wi')} className="flex gap-4 pb-2">
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="ex" id="ex" /><Label htmlFor="ex">Regular</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="wi" id="wi" /><Label htmlFor="wi" className="text-blue-600 font-bold">New Customer</Label></div>
                                </RadioGroup>
                                {isWalkIn ? (
                                    <div className="grid grid-cols-2 gap-2 animate-in fade-in">
                                        <Input placeholder="Full Name" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} required />
                                        <Input placeholder="Phone" value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} />
                                    </div>
                                ) : (
                                    <Combobox options={customers.map((c: any) => ({ value: c.id, label: c.name }))} value={customerId} onValueChange={setCustomerId} />
                                )}
                                <div className="pt-2"><Label>Order Date *</Label><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
                            </Card>

                            <Card className="p-4 space-y-4 shadow-sm">
                                <Label className="font-bold underline">2. PAYMENT SETUP</Label>
                                <RadioGroup value={paymentTerm} onValueChange={(v) => setPaymentTerm(v as any)} className="flex gap-4">
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="Full Payment" id="fp" /><Label htmlFor="fp">Full Pay</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="Part Payment" id="pp" /><Label htmlFor="pp">Part Pay</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="Credit" id="cr" /><Label htmlFor="cr">Credit</Label></div>
                                </RadioGroup>
                                <div className="grid grid-cols-2 gap-2">
                                    <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as any)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="UPI">UPI</SelectItem><SelectItem value="Cheque">Cheque</SelectItem></SelectContent>
                                    </Select>
                                    <div className="flex items-center space-x-2"><Checkbox id="gst" checked={isGstInvoice} onCheckedChange={(v) => setIsGstInvoice(!!v)} /><Label htmlFor="gst">GST Invoice</Label></div>
                                </div>
                                {paymentTerm === 'Part Payment' && <Input type="number" placeholder="Enter Paid Amount" value={partPaymentAmount} onChange={(e) => setPartPaymentAmount(e.target.value)} />}
                            </Card>
                        </div>

                        {/* 3. PRODUCT SELECTION */}
                        <Card className="p-4 space-y-4 border-blue-200 bg-blue-50/10 shadow-sm">
                            <Label className="font-bold underline text-blue-700">3. PRODUCT SELECTION</Label>
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                                <div className="md:col-span-4"><Label>Product</Label><Combobox options={products.map((p:any) => ({ value: p.id, label: p.name }))} value={currentItem.productId} onValueChange={(v) => { 
                                    const p = products.find((x:any) => x.id === v); 
                                    if(p) setCurrentItem({ ...currentItem, productId: p.id, price: String(p.salePrice || p.price || 0), gst: String(p.gst || 0), category: p.category, weightPerUnit: p.weightPerUnit || 0 }); 
                                }} /></div>
                                <div className="md:col-span-2"><Label>Qty</Label><Input type="number" value={currentItem.quantity} onChange={(e) => {
                                    const q = e.target.value;
                                    setCurrentItem({ ...currentItem, quantity: q, totalWeight: isWeightBased(currentItem.category) ? (parseFloat(q) * currentItem.weightPerUnit).toFixed(2) : '' });
                                }} /></div>
                                {isWeightBased(currentItem.category) && <div className="md:col-span-2"><Label>Weight kg</Label><Input type="number" value={currentItem.totalWeight} onChange={(e) => setCurrentItem({ ...currentItem, totalWeight: e.target.value })} /></div>}
                                <div className="md:col-span-2"><Label>Price</Label><Input type="number" value={currentItem.price} onChange={(e) => setCurrentItem({ ...currentItem, price: e.target.value })} /></div>
                                <div className="md:col-span-2"><Button type="button" onClick={() => { if(currentItem.productId && currentItem.quantity) { setItems([...items, currentItem]); setCurrentItem(initialItemState); } }} className="w-full bg-blue-600 text-white">Add</Button></div>
                            </div>
                            <Table className="border bg-white rounded-md overflow-hidden">
                                <TableHeader className="bg-slate-50"><TableRow><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead className="text-right">Total</TableHead><TableHead></TableHead></TableRow></TableHeader>
                                <TableBody>{items.map((it, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>{products.find(p => p.id === it.productId)?.name}</TableCell>
                                        <TableCell>{it.quantity}</TableCell>
                                        <TableCell className="text-right">{formatINR(parseFloat(it.price) * (parseFloat(it.totalWeight) || parseFloat(it.quantity)))}</TableCell>
                                        <TableCell className="text-center"><Button variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                                    </TableRow>
                                ))}</TableBody>
                            </Table>
                        </Card>

                        {/* 4. LOGISTICS & TOTALS */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card className="p-4 space-y-4 shadow-sm">
                                <Label className="font-bold underline">4. LOGISTICS</Label>
                                <div className="space-y-2"><Label>Delivery Date</Label><Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></div>
                                <div className="space-y-2"><Label>Delivery Address *</Label><Textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} /></div>
                            </Card>
                            <Card className="p-4 space-y-1 bg-slate-50 border shadow-inner">
                                <div className="flex justify-between"><span>Items Total:</span><span>{formatINR(math.total)}</span></div>
                                <div className="flex justify-between items-center"><span>Delivery Fees:</span><Input className="w-20 h-7" type="number" value={deliveryFees} onChange={(e) => setDeliveryFees(parseFloat(e.target.value) || 0)} /></div>
                                <div className="flex justify-between items-center text-red-600"><span>Prev Balance:</span><span>{formatINR(previousBalance)}</span></div>
                                <Separator className="my-2"/><div className="flex justify-between text-xl font-bold pt-2"><span>Grand Total:</span><span className="text-blue-600">{formatINR(math.grand)}</span></div>
                            </Card>
                        </div>

                        <DialogFooter className="p-4 border-t bg-white gap-2">
                            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button type="submit" disabled={!canSubmit} className="bg-blue-600 text-white hover:bg-blue-700">Confirm & Save Order</Button>
                        </DialogFooter>
                    </form>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}