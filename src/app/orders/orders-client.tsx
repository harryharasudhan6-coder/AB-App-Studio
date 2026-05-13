'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { Order, Customer, Product, PaymentTerm, PaymentMode, CalculationType, ProductCategory, OrderItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, FileText, PlusCircle, Trash2, Edit, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { UserOptions } from 'jspdf-autotable';

interface jsPDFWithPlugin extends jsPDF {
    autoTable: (options: UserOptions) => jsPDF;
    previousAutoTable: { finalY: number };
}

type OrderItemState = { 
    productId: string; quantity: string; price: string; cost: string; gst: string; 
    stock: number; category: ProductCategory; weightPerUnit: number; totalWeight: string; 
};

const WEIGHT_BASED_CATEGORIES: string[] = ['Rings', 'Rods', 'Steel', 'Rods & Rings', 'Savukku Stick'];
const isWeightBased = (category: string) => WEIGHT_BASED_CATEGORIES.includes(category);

const formatINR = (val: number | undefined) => `INR ${(val ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OrdersClient({ orders: initialOrders, customers: initialCustomers, products: initialProducts }: { orders: Order[], customers: Customer[], products: Product[] }) {
    const [orders, setOrders] = useState<Order[]>(initialOrders);
    const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);
    const [orderToEdit, setOrderToEdit] = useState<Order | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isMounted, setIsMounted] = useState(false);
    const { toast } = useToast();

    useEffect(() => { setIsMounted(true); }, []);

    const refreshData = async () => {
        const data = await getCoreOrderData();
        setOrders(data.orders);
        setCustomers(data.customers);
    };

    const handlePrint = (order: Order) => {
        const customer = customers.find(c => c.id === order.customerId);
        const doc = new jsPDF() as jsPDFWithPlugin;
        const margin = 14;
        const pageWidth = doc.internal.pageSize.getWidth();

        doc.setFontSize(18).setFont('helvetica', 'bold').text("AB AGENCY", pageWidth / 2, 20, { align: 'center' });
        doc.setFontSize(9).setFont('helvetica', 'normal').text('No.1, Ayyanchery main road, Urapakkam, Chennai - 603210', pageWidth / 2, 26, { align: 'center' });
        doc.text('Email: abagency1977@gmail.com | MOB: 95511 95505 / 95001 82975', pageWidth / 2, 31, { align: 'center' });

        doc.setFontSize(10).setFont('helvetica', 'bold').text('Billed To:', margin, 45);
        doc.setFont('helvetica', 'normal').text([customer?.name || order.customerName, customer?.address || 'N/A', `Phone: ${customer?.phone || 'N/A'}`], margin, 50);
        
        doc.setFont('helvetica', 'bold').text(`GSTIN: 33DMLPA8598D1ZU`, pageWidth - margin, 45, { align: 'right' });
        const isCredit = order.paymentTerm === 'Credit';
        doc.setTextColor(isCredit ? 255 : 0, 0, 0).text(isCredit ? "CREDIT INVOICE" : "FULL PAYMENT INVOICE", pageWidth - margin, 52, { align: 'right' });
        doc.setTextColor(0).setFont('helvetica', 'normal').text([`Invoice No: ${order.id.replace('ORD', 'INV')}`, `Date: ${new Date(order.orderDate).toLocaleDateString('en-IN')}`], pageWidth - margin, 59, { align: 'right' });

        const body = order.items.map(i => [
            i.productName, 
            `${i.quantity} pcs`, 
            i.totalWeight ? `${i.totalWeight} kg` : 'N/A', 
            formatINR(i.price), 
            i.gst ? `${i.gst}%` : 'N/A', 
            formatINR(i.price * (i.totalWeight || i.quantity))
        ]);

        (doc as any).autoTable({ 
            startY: 80, 
            head: [['Item Description', 'Quantity', 'Total Weight', 'Rate', 'GST', 'Total']], 
            body, 
            theme: 'grid', 
            headStyles: { fillColor: [204, 229, 255], textColor: [0, 0, 0] } 
        });

        let finalY = (doc as any).previousAutoTable.finalY + 10;
        const totalGst = order.items.reduce((s, i) => s + (i.price * (i.totalWeight || i.quantity) * ((i.gst || 0) / 100)), 0);

        doc.text(`Current Items Total: ${formatINR(order.total)}`, pageWidth - margin, finalY, { align: 'right' });
        finalY += 6;

        if (order.isGstInvoice && totalGst > 0) {
            doc.text(`CGST (Split): ${formatINR(totalGst / 2)}`, pageWidth - margin, finalY, { align: 'right' });
            finalY += 6;
            doc.text(`SGST (Split): ${formatINR(totalGst / 2)}`, pageWidth - margin, finalY, { align: 'right' });
            finalY += 6;
        }

        doc.text(`Delivery Fees: ${formatINR(order.deliveryFees)}`, pageWidth - margin, finalY, { align: 'right' });
        finalY += 8;
        doc.setFontSize(12).setFont('helvetica', 'bold').text(`Grand Total: ${formatINR(order.grandTotal)}`, pageWidth / 2, finalY + 5, { align: 'center' });

        doc.save(`INV-${order.id}.pdf`);
    };

    return (
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-4xl font-bold">Orders</h1>
                <Button onClick={() => setIsAddOrderOpen(true)} className="bg-blue-600"><PlusCircle className="mr-2 h-4 w-4" /> Place Order</Button>
            </div>
            <div className="rounded-md border bg-white overflow-x-auto shadow-sm">
                <Table>
                    <TableHeader><TableRow><TableHead>Order ID</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-center">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {orders.filter(o => o.id.toLowerCase().includes(searchQuery.toLowerCase()) || o.customerName.toLowerCase().includes(searchQuery.toLowerCase())).map(order => (
                            <TableRow key={order.id}>
                                <TableCell className="font-medium">{order.id}</TableCell>
                                <TableCell>{order.customerName}</TableCell>
                                <TableCell className="text-right font-semibold">{formatINR(order.grandTotal)}</TableCell>
                                <TableCell className="text-center">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost"><MoreHorizontal /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => setOrderToEdit(order)}>Edit</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handlePrint(order)}>Invoice</DropdownMenuItem>
                                            <DropdownMenuItem onClick={async () => { await deleteOrderFromDB(order); await refreshData(); }} className="text-red-600">Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <AddOrderDialog isOpen={isAddOrderOpen || !!orderToEdit} onOpenChange={(open: boolean) => { if (!open) { setIsAddOrderOpen(false); setOrderToEdit(null); } }} customers={customers} products={products} refreshData={refreshData} existingOrder={orderToEdit} />
        </div>
    );
}

function AddOrderDialog({ isOpen, onOpenChange, customers, products, refreshData, existingOrder }: any) {
    const [customerId, setCustomerId] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<OrderItemState[]>([]);
    const [currentItem, setCurrentItem] = useState<OrderItemState>({ productId: '', quantity: '', price: '', cost: '', gst: '', stock: 0, category: 'General', weightPerUnit: 0, totalWeight: '' });
    const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>('Full Payment');
    const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
    const [isGstInvoice, setIsGstInvoice] = useState(true);
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [deliveryDate, setDeliveryDate] = useState('');
    const [deliveryFees, setDeliveryFees] = useState(0);
    const [discount, setDiscount] = useState(0);
    const [enableDiscount, setEnableDiscount] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && existingOrder) {
            setCustomerId(existingOrder.customerId);
            setOrderDate(new Date(existingOrder.orderDate).toISOString().split('T')[0]);
            setItems(existingOrder.items.map((i: any) => ({ ...i, quantity: String(i.quantity), price: String(i.price), gst: String(i.gst || 0), totalWeight: String(i.totalWeight || '') })));
            setIsGstInvoice(existingOrder.isGstInvoice);
            setDeliveryAddress(existingOrder.deliveryAddress);
            setPaymentTerm(existingOrder.paymentTerm);
            setDeliveryFees(existingOrder.deliveryFees || 0);
        } else if (isOpen) { setCustomerId(''); setItems([]); setDeliveryFees(0); setDeliveryAddress(''); }
    }, [isOpen, existingOrder]);

    const math = useMemo(() => {
        const taxableTotal = items.reduce((sum, i) => sum + (parseFloat(i.price) * (parseFloat(i.totalWeight) || parseFloat(i.quantity))), 0);
        const totalGst = isGstInvoice ? items.reduce((sum, i) => sum + (parseFloat(i.price) * (parseFloat(i.totalWeight) || parseFloat(i.quantity)) * (parseFloat(i.gst) / 100)), 0) : 0;
        const total = taxableTotal + totalGst;
        return { total, grand: total + deliveryFees - (enableDiscount ? discount : 0) };
    }, [items, isGstInvoice, deliveryFees, discount, enableDiscount]);

    const handleSubmit = async () => {
        const orderData = { 
            customerId, orderDate: new Date(orderDate).toISOString(), deliveryDate, deliveryAddress, deliveryFees, discount: enableDiscount ? discount : 0,
            items: items.map(i => ({ ...i, quantity: parseFloat(i.quantity), price: parseFloat(i.price), totalWeight: parseFloat(i.totalWeight) || 0, gst: parseFloat(i.gst) })), 
            total: math.total, grandTotal: math.grand, paymentTerm, paymentMode, isGstInvoice,
            customerName: customers.find((c:any) => c.id === customerId)?.name, 
            status: paymentTerm === 'Full Payment' ? 'Fulfilled' : 'Pending'
        };
        existingOrder ? await updateOrder({ ...existingOrder, ...orderData }) : await addOrder(orderData);
        await refreshData();
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl h-[95vh] flex flex-col p-0 overflow-hidden shadow-2xl">
                <DialogHeader className="p-4 border-b bg-slate-50"><DialogTitle>Place New Order</DialogTitle></DialogHeader>
                <ScrollArea ref={scrollRef} className="flex-1 p-6" onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') scrollRef.current?.scrollBy(0, 60);
                    if (e.key === 'ArrowUp') scrollRef.current?.scrollBy(0, -60);
                }}>
                    <div className="space-y-6">
                        {/* 1. ORDER DETAILS (Screenshot 2) */}
                        <Card className="border shadow-none">
                            <CardContent className="p-6 space-y-4">
                                <h3 className="font-bold text-lg">Order Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                                    <div className="space-y-2">
                                        <Label>Customer Name</Label>
                                        <div className="flex gap-2">
                                            <Combobox options={customers.map((c:any) => ({ value: c.id, label: c.name }))} value={customerId} onValueChange={setCustomerId} placeholder="Select a customer" />
                                            <Button variant="outline" onClick={() => {}}>Add New</Button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Order Date</Label>
                                        <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2 pt-2">
                                    <Checkbox id="gst" checked={isGstInvoice} onCheckedChange={(v) => setIsGstInvoice(!!v)} className="data-[state=checked]:bg-blue-600 border-slate-300" />
                                    <Label htmlFor="gst" className="text-slate-600 font-medium">Generate GST Invoice?</Label>
                                </div>
                                <div className="space-y-2">
                                    <Label className="block mb-2 font-semibold text-slate-700">Payment Term</Label>
                                    <RadioGroup value={paymentTerm} onValueChange={(v:any) => setPaymentTerm(v)} className="flex gap-6">
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="Full Payment" id="fp" /><Label htmlFor="fp">Full Payment</Label></div>
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="Credit" id="cr" /><Label htmlFor="cr">Credit</Label></div>
                                    </RadioGroup>
                                </div>
                                <div className="space-y-2 max-w-md">
                                    <Label className="text-slate-600">Payment Mode</Label>
                                    <Select value={paymentMode} onValueChange={(v:any) => setPaymentMode(v)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Cash">Cash</SelectItem>
                                            <SelectItem value="UPI">UPI</SelectItem>
                                            <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                                            <SelectItem value="Cheque">Cheque</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        {/* 2. ADD ITEMS (Screenshot 3) */}
                        <Card className="border shadow-none">
                            <CardContent className="p-6 space-y-4">
                                <h3 className="font-bold text-lg">Add Items</h3>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                                    <div className="md:col-span-1"><Label>Item Name</Label><Combobox options={products.map((p:any) => ({ value: p.id, label: p.name }))} value={currentItem.productId} onValueChange={(v) => {
                                        const p = products.find((x:any) => x.id === v);
                                        if(p) setCurrentItem({ ...currentItem, productId: p.id, stock: p.stock, price: String(p.salePrice || p.price), gst: String(p.gst || 0), category: p.category, weightPerUnit: p.weightPerUnit || 0 });
                                    }} /></div>
                                    <div><Label>Stock</Label><Input value={currentItem.stock} readOnly className="bg-slate-50" /></div>
                                    <div><Label>Quantity</Label><Input type="number" value={currentItem.quantity} onChange={(e) => {
                                        const q = e.target.value;
                                        const w = isWeightBased(currentItem.category) ? (parseFloat(q) * currentItem.weightPerUnit).toFixed(2) : '';
                                        setCurrentItem({ ...currentItem, quantity: q, totalWeight: w });
                                    }} /></div>
                                    <div><Label>Sale Price</Label><Input type="number" value={currentItem.price} onChange={(e) => setCurrentItem({ ...currentItem, price: e.target.value })} /></div>
                                    <Button type="button" onClick={() => { if(currentItem.productId) { setItems([...items, currentItem]); setCurrentItem({ productId: '', quantity: '', price: '', cost: '', gst: '', stock: 0, category: 'General', weightPerUnit: 0, totalWeight: '' }); } }} className="bg-blue-600">Add Item</Button>
                                </div>
                                <h4 className="font-semibold text-slate-700 pt-4">Order Items</h4>
                                <Table className="border rounded-md mt-2">
                                    <TableHeader className="bg-slate-50"><TableRow>
                                        <TableHead>Item</TableHead><TableHead>Quantity</TableHead><TableHead>Total Wt.</TableHead><TableHead>Price</TableHead><TableHead>GST</TableHead><TableHead>Total</TableHead><TableHead>Actions</TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>
                                        {items.map((it, idx) => {
                                            const basis = isWeightBased(it.category) ? parseFloat(it.totalWeight) : parseFloat(it.quantity);
                                            const total = parseFloat(it.price) * basis * (1 + (parseFloat(it.gst)/100));
                                            return (
                                                <TableRow key={idx}>
                                                    <TableCell>{products.find(p=>p.id===it.productId)?.name}</TableCell>
                                                    <TableCell>{it.quantity}</TableCell>
                                                    <TableCell>{it.totalWeight || '-'}</TableCell>
                                                    <TableCell>{formatINR(parseFloat(it.price))}</TableCell>
                                                    <TableCell>{it.gst}%</TableCell>
                                                    <TableCell>{formatINR(total)}</TableCell>
                                                    <TableCell><Button variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        {/* 3. DELIVERY & SUMMARY (Screenshot 3 Bottom) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="border shadow-none">
                                <CardContent className="p-6 space-y-4">
                                    <h3 className="font-bold text-lg">Delivery Details</h3>
                                    <div className="space-y-2"><Label>Delivery Date</Label><Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></div>
                                    <div className="space-y-2"><Label>Delivery Address</Label><Textarea placeholder="Leave blank to use customer's default address" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} rows={3} /></div>
                                </CardContent>
                            </Card>
                            <Card className="border shadow-none">
                                <CardContent className="p-6 space-y-4">
                                    <h3 className="font-bold text-lg">Order Summary</h3>
                                    <div className="flex justify-between font-medium"><span>Current Items Total:</span><span>{formatINR(math.total)}</span></div>
                                    <div className="flex justify-between items-center"><Label>Delivery Fees</Label><Input type="number" className="w-24 text-right" value={deliveryFees} onChange={(e) => setDeliveryFees(parseFloat(e.target.value) || 0)} /></div>
                                    <div className="flex justify-between items-center"><div className="flex items-center space-x-2"><Checkbox id="d" checked={enableDiscount} onCheckedChange={(v)=>setEnableDiscount(!!v)} /><Label htmlFor="d">Discount</Label></div><Input type="number" className="w-24 text-right" disabled={!enableDiscount} value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} /></div>
                                    <Separator />
                                    <div className="flex justify-between font-medium"><span>Subtotal:</span><span>{formatINR(math.total + deliveryFees)}</span></div>
                                    <div className="flex justify-between text-2xl font-bold text-blue-700 pt-2 border-t"><span>Grand Total:</span><span>{formatINR(math.grand)}</span></div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </ScrollArea>
                <DialogFooter className="p-4 border-t bg-white gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button className="bg-blue-600" onClick={handleSubmit}>Submit Order</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}