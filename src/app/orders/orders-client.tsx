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

type OrderItemState = { 
    productId: string; quantity: string; price: string; cost: string; gst: string; 
    stock: number; calculationType: CalculationType; category: ProductCategory; 
    weightPerUnit: number; totalWeight: string; 
};

// --- CONSTANTS ---
const WEIGHT_BASED_CATEGORIES: string[] = ['Rings', 'Rods', 'Steel', 'Rods & Rings', 'Savukku Stick'];
const isWeightBased = (category: string) => WEIGHT_BASED_CATEGORIES.includes(category);
const initialItemState: OrderItemState = { 
    productId: '', quantity: '', price: '', cost: '', gst: '', stock: 0, 
    calculationType: 'Per Unit', category: 'General', weightPerUnit: 0, totalWeight: '' 
};

const formatNumberForDisplay = (value: number | undefined) => {
    const amount = value ?? 0;
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
};

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
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        const savedLogo = localStorage.getItem('companyLogo');
        if (savedLogo) setLogoUrl(savedLogo);
    }, []);

    useEffect(() => {
        if (orderToPrint) handlePrint();
    }, [orderToPrint]);

    const handlePrint = async () => {
        if (!orderToPrint) return;
        const customer = customers.find(c => c.id === orderToPrint.customerId);
        if(!customer) return;
        setIsLoading(true);
        try {
            const doc = new jsPDF() as jsPDFWithPlugin;
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 14;

            if (logoUrl) { try { doc.addImage(logoUrl, 'PNG', pageWidth / 2 - 12.5, 15, 25, 20); } catch (e) { console.error("Logo Error"); } }
            
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
            const addressLines = doc.splitTextToSize(customer.address || 'N/A', 80);
            doc.text(addressLines, margin, yPos);
            yPos += (addressLines.length * 5);
            doc.text(`Phone: ${customer.phone || 'N/A'}`, margin, yPos);

            let rightYPos = 58;
            doc.setFont('helvetica', 'bold').text('GSTIN: 33DMLPA8598D1ZU', pageWidth - margin, rightYPos, { align: 'right' });
            rightYPos += 8;
            const isCredit = orderToPrint.paymentTerm === 'Credit';
            doc.setFontSize(11).setTextColor(isCredit ? 255 : 0, isCredit ? 0 : 128, 0).text(isCredit ? 'CREDIT INVOICE' : 'INVOICE', pageWidth - margin, rightYPos, { align: 'right' });
            doc.setTextColor(0).setFontSize(10).setFont('helvetica', 'normal');
            rightYPos += 10;
            doc.text(`Invoice No: ${orderToPrint.id.replace('ORD', 'INV')}`, pageWidth - margin, rightYPos, { align: 'right' });
            rightYPos += 5;
            doc.text(`Date: ${new Date(orderToPrint.orderDate).toLocaleDateString('en-IN')}`, pageWidth - margin, rightYPos, { align: 'right' });

            const tableBody = orderToPrint.items.map(item => [
                item.productName,
                `${item.quantity} ${isWeightBased(item.category) ? 'nos' : 'pcs'}`,
                isWeightBased(item.category) ? `${(item.totalWeight ?? 0).toFixed(2)} kg` : 'N/A',
                formatNumberForDisplay(item.price),
                orderToPrint.isGstInvoice ? `${item.gst}%` : 'N/A',
                formatNumberForDisplay(item.price * (item.totalWeight || item.quantity) * (1 + (orderToPrint.isGstInvoice ? (item.gst || 0) / 100 : 0)))
            ]);

            (doc as any).autoTable({
                startY: Math.max(yPos, rightYPos) + 10,
                head: [['Item Description', 'Qty', 'Weight', 'Rate', 'GST', 'Total']],
                body: tableBody,
                theme: 'grid',
                headStyles: { fillColor: [204, 229, 255], textColor: [0, 0, 0], fontStyle: 'bold' }
            });

            let finalY = (doc as any).previousAutoTable.finalY + 10;
            const addTotalRow = (label: string, value: number, isBold = false) => {
                if (isBold) doc.setFont('helvetica', 'bold');
                doc.text(label, pageWidth - margin - 50, finalY, { align: 'right' });
                doc.text(formatNumberForDisplay(value), pageWidth - margin, finalY, { align: 'right' });
                if (isBold) doc.setFont('helvetica', 'normal');
                finalY += 6;
            };

            addTotalRow("Subtotal:", (orderToPrint.total ?? 0) + (orderToPrint.deliveryFees ?? 0) - (orderToPrint.discount ?? 0), true);
            if(orderToPrint.previousBalance > 0) addTotalRow("Previous Balance:", orderToPrint.previousBalance);
            finalY += 4;
            doc.setFontSize(12).setFont('helvetica', 'bold').text(`Grand Total: ${formatNumberForDisplay(orderToPrint.grandTotal)}`, pageWidth / 2, finalY, { align: 'center' });
            doc.save(`INV-${orderToPrint.id.replace('ORD','INV')}.pdf`);
        } catch (e) { toast({ title: "Error", description: "PDF Generation Failed" }); }
        finally { setIsLoading(false); setOrderToPrint(null); }
    };

    const handleWhatsAppShare = (order: Order) => {
        const customer = customers.find(c => c.id === order.customerId);
        if (!customer?.phone) return toast({ title: 'Error', description: 'No phone number.' });
        const cleanName = customer.name.replace(' (Walk-In)', '');
        const message = `Hello *${cleanName}*,%0A%0AHere is your invoice *${order.id.replace('ORD', 'INV')}* from *AB Agency*.%0A%0A*Grand Total:* ${formatNumberForDisplay(order.grandTotal)}%0A%0AThank you for your business!`;
        window.open(`https://wa.me/91${customer.phone.replace(/\D/g, '')}?text=${message}`, '_blank');
    };

    if (!isMounted) return <Skeleton className="h-96 w-full" />;

    return (
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Orders</h1>
                <Button onClick={() => setIsAddOrderOpen(true)}><PlusCircle className="mr-2 h-4 w-4" /> Place Order</Button>
            </div>
            <Input placeholder="Search orders..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="max-w-md" />
            <div className="rounded-md border bg-white">
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
                        {orders.filter(o => o.id.toLowerCase().includes(searchQuery.toLowerCase()) || o.customerName.toLowerCase().includes(searchQuery.toLowerCase())).map(order => (
                            <TableRow key={order.id}>
                                <TableCell className="font-bold">{order.id}</TableCell>
                                <TableCell>{order.customerName}</TableCell>
                                <TableCell>{new Date(order.orderDate).toLocaleDateString('en-IN')}</TableCell>
                                <TableCell className="text-right">{formatNumberForDisplay(order.grandTotal)}</TableCell>
                                <TableCell className="text-center">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost"><MoreHorizontal /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => setOrderToEdit(order)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setOrderToPrint(order)}><FileText className="mr-2 h-4 w-4" /> Invoice</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleWhatsAppShare(order)}><Share2 className="mr-2 h-4 w-4" /> WhatsApp</DropdownMenuItem>
                                            <DropdownMenuItem onClick={async () => { await deleteOrderFromDB(order); setOrders(orders.filter(o => o.id !== order.id)); }} className="text-red-600"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
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
                orders={orders}
                onOrderAdded={async (d) => { const res = await addOrder(d); setOrders(prev => [res, ...prev]); return res; }}
                onOrderUpdated={async (d) => { await updateOrder(d); setOrders(prev => prev.map(o => o.id === d.id ? d : o)); }}
                onCustomerAdded={async (d) => { const c = await addCustomer(d); setCustomers(p => [...p, c]); return c; }}
                existingOrder={orderToEdit}
            />
        </div>
    );
}

function AddOrderDialog({ isOpen, onOpenChange, customers, products, orders, onOrderAdded, onOrderUpdated, onCustomerAdded, existingOrder }: any) {
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
    const [isGstInvoice, setIsGstInvoice] = useState(true);
    const [discount, setDiscount] = useState(0);
    const [deliveryFees, setDeliveryFees] = useState(0);
    const [previousBalance, setPreviousBalance] = useState(0);

    const isEditMode = !!existingOrder;
    const { toast } = useToast();

    const resetForm = useCallback(() => {
        setIsWalkIn(false); setWalkInName(''); setWalkInPhone(''); setCustomerId('');
        setOrderDate(new Date().toISOString().split('T')[0]); setItems([]);
        setCurrentItem(initialItemState); setDeliveryAddress(''); setDiscount(0); setDeliveryFees(0); setPreviousBalance(0);
        setPartPaymentAmount('');
    }, []);

    useEffect(() => {
        if (isOpen && existingOrder) {
            setIsWalkIn(existingOrder.customerName.includes('(Walk-In)'));
            setCustomerId(existingOrder.customerId);
            setOrderDate(new Date(existingOrder.orderDate).toISOString().split('T')[0]);
            setItems(existingOrder.items.map((i: any) => ({ ...i, quantity: String(i.quantity), price: String(i.price), totalWeight: i.totalWeight ? String(i.totalWeight) : '' })));
            setDeliveryAddress(existingOrder.deliveryAddress || '');
            setPaymentTerm(existingOrder.paymentTerm);
            setPreviousBalance(existingOrder.previousBalance || 0);
        } else if (isOpen) { resetForm(); }
    }, [isOpen, existingOrder, resetForm]);

    useEffect(() => {
        if (customerId && !isEditMode) getCustomerBalance(customerId).then(setPreviousBalance);
    }, [customerId, isEditMode]);

    const math = useMemo(() => {
        const base = items.reduce((sum, i) => {
            const q = parseFloat(i.quantity) || 0;
            const p = parseFloat(i.price) || 0;
            const weight = isWeightBased(i.category) ? (parseFloat(i.totalWeight) || (q * i.weightPerUnit)) : q;
            const line = p * weight;
            return sum + line + (isGstInvoice ? line * (parseFloat(i.gst) / 100) : 0);
        }, 0);
        return { total: base, grand: base + deliveryFees - discount + previousBalance };
    }, [items, isGstInvoice, deliveryFees, discount, previousBalance]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        let fId = customerId, fName = customers.find(c => c.id === customerId)?.name || '';
        if (isWalkIn) { const nc = await onCustomerAdded({ name: `${walkInName} (Walk-In)`, phone: walkInPhone, address: 'Walk-In' }); fId = nc.id; fName = nc.name; }
        
        const data = {
            customerId: fId, customerName: fName, orderDate: new Date(orderDate).toISOString(),
            items: items.map(i => ({ ...i, quantity: parseFloat(i.quantity), price: parseFloat(i.price), totalWeight: parseFloat(i.totalWeight) || 0 })),
            total: math.total, grandTotal: math.grand, previousBalance, deliveryFees, discount, paymentTerm, deliveryAddress, isGstInvoice, status: paymentTerm === 'Full Payment' ? 'Fulfilled' : 'Pending'
        };

        isEditMode ? await onOrderUpdated({ ...existingOrder, ...data }) : await onOrderAdded(data);
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl h-[94vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-4 border-b bg-slate-50"><DialogTitle>{isEditMode ? 'Edit Order' : 'New Order'}</DialogTitle></DialogHeader>
                <ScrollArea className="flex-1 p-6">
                    <form id="order-form" onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card className="p-4 space-y-4">
                                <Label className="font-bold">Customer Selection</Label>
                                <RadioGroup value={isWalkIn ? 'wi' : 'ex'} onValueChange={(v) => setIsWalkIn(v === 'wi')} className="flex gap-4">
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="ex" id="ex" /><Label htmlFor="ex">Existing</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="wi" id="wi" /><Label htmlFor="wi">Walk-In</Label></div>
                                </RadioGroup>
                                {isWalkIn ? <div className="space-y-2"><Input placeholder="Name" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} /><Input placeholder="Phone" value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} /></div> : <Combobox options={customers.map(c => ({ value: c.id, label: c.name }))} value={customerId} onValueChange={setCustomerId} />}
                            </Card>
                            <Card className="p-4 space-y-4">
                                <Label className="font-bold">Date & GST</Label>
                                <div className="grid grid-cols-2 gap-4">
                                    <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                                    <div className="flex items-center space-x-2"><Checkbox id="gst" checked={isGstInvoice} onCheckedChange={(v) => setIsGstInvoice(!!v)} /><Label htmlFor="gst">GST Invoice</Label></div>
                                </div>
                                <Textarea placeholder="Delivery Address *" required value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
                            </Card>
                        </div>

                        <Card className="p-4 space-y-4">
                            <Label className="font-bold">Payment Setup</Label>
                            <RadioGroup value={paymentTerm} onValueChange={(v) => setPaymentTerm(v as any)} className="flex gap-6 pb-2">
                                <div className="flex items-center space-x-2"><RadioGroupItem value="Full Payment" id="fp" /><Label htmlFor="fp">Full Payment</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="Part Payment" id="pp" /><Label htmlFor="pp">Part Payment</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="Credit" id="cr" /><Label htmlFor="cr">Credit</Label></div>
                            </RadioGroup>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Payment Mode</Label>
                                    <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as any)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Cash">Cash</SelectItem>
                                            <SelectItem value="UPI">UPI</SelectItem>
                                            <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                                            <SelectItem value="Cheque">Cheque</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {paymentTerm === 'Part Payment' && (
                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                                        <Label>Advance Amount</Label>
                                        <Input type="number" placeholder="Enter Amount" value={partPaymentAmount} onChange={(e) => setPartPaymentAmount(e.target.value)} />
                                    </div>
                                )}
                            </div>
                        </Card>

                        <Card className="p-4 space-y-4">
                            <Label className="font-bold">Product Selection</Label>
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                                <div className="md:col-span-4"><Label>Product</Label><Combobox options={products.map(p => ({ value: p.id, label: p.name }))} value={currentItem.productId} onValueChange={(v) => { 
                                    const p = products.find(x => x.id === v); 
                                    if(p) setCurrentItem({ ...currentItem, productId: p.id, price: String(p.salePrice), gst: String(p.gst), category: p.category, weightPerUnit: p.weightPerUnit || 0 }); 
                                }} /></div>
                                <div className="md:col-span-2"><Label>Qty</Label><Input type="number" value={currentItem.quantity} onChange={(e) => {
                                    const qty = e.target.value;
                                    const weight = isWeightBased(currentItem.category) ? (parseFloat(qty) * currentItem.weightPerUnit).toFixed(2) : '';
                                    setCurrentItem({ ...currentItem, quantity: qty, totalWeight: weight });
                                }} /></div>
                                {isWeightBased(currentItem.category) && <div className="md:col-span-2"><Label>Weight (kg)</Label><Input type="number" value={currentItem.totalWeight} onChange={(e) => setCurrentItem({ ...currentItem, totalWeight: e.target.value })} /></div>}
                                <div className="md:col-span-2"><Label>Price/Rate</Label><Input type="number" value={currentItem.price} onChange={(e) => setCurrentItem({ ...currentItem, price: e.target.value })} /></div>
                                <div className="md:col-span-2"><Button type="button" onClick={() => { if(currentItem.productId && currentItem.quantity) { setItems([...items, currentItem]); setCurrentItem(initialItemState); } }} className="w-full">Add Item</Button></div>
                            </div>
                            <div className="border rounded-md mt-4">
                                <Table>
                                    <TableHeader className="bg-slate-50"><TableRow><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Weight</TableHead><TableHead className="text-right">Total</TableHead><TableHead></TableHead></TableRow></TableHeader>
                                    <TableBody>{items.map((it, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell>{products.find(p => p.id === it.productId)?.name}</TableCell>
                                            <TableCell>{it.quantity}</TableCell>
                                            <TableCell>{isWeightBased(it.category) ? `${parseFloat(it.totalWeight).toFixed(2)} kg` : '-'}</TableCell>
                                            <TableCell className="text-right">{formatNumberForDisplay(parseFloat(it.price) * (isWeightBased(it.category) ? parseFloat(it.totalWeight) : parseFloat(it.quantity)))}</TableCell>
                                            <TableCell className="text-center"><Button variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                                        </TableRow>
                                    ))}</TableBody>
                                </Table>
                            </div>
                        </Card>

                        <Card className="p-4 space-y-2 bg-slate-50 text-sm ml-auto max-w-md">
                            <div className="flex justify-between"><span>Items Subtotal:</span><span>{formatNumberForDisplay(math.total)}</span></div>
                            <div className="flex justify-between items-center"><span>Delivery Fees:</span><Input className="w-24 h-8" type="number" value={deliveryFees} onChange={(e) => setDeliveryFees(parseFloat(e.target.value) || 0)} /></div>
                            <div className="flex justify-between items-center"><span>Discount:</span><Input className="w-24 h-8" type="number" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} /></div>
                            <div className="flex justify-between text-red-600 font-medium"><span>Prev. Balance:</span><span>{formatNumberForDisplay(previousBalance)}</span></div>
                            <Separator /><div className="flex justify-between text-xl font-bold"><span>Grand Total:</span><span className="text-primary">{formatNumberForDisplay(math.grand)}</span></div>
                        </Card>
                    </form>
                </ScrollArea>
                <DialogFooter className="p-4 border-t bg-white"><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button form="order-form" type="submit" disabled={items.length === 0}>Confirm Order</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}