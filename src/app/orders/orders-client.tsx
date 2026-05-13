'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Order, Customer, Product, PaymentTerm, PaymentMode, CalculationType, ProductCategory, OrderItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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

const formatINR = (val: number | undefined) => `₹${(val ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

export function OrdersClient({ orders: initialOrders, customers: initialCustomers, products: initialProducts }: { orders: Order[], customers: Customer[], products: Product[] }) {
    const [orders, setOrders] = useState<Order[]>(initialOrders);
    const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);
    const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);
    const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
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

    const handlePrint = async (order: Order) => {
        try {
            const doc = new jsPDF() as jsPDFWithPlugin;
            doc.text(`Invoice: ${order.id}`, 14, 20);
            doc.save(`INV-${order.id}.pdf`);
        } catch (e) { toast({ title: "Print Failed" }); }
    };

    if (!isMounted) return <Skeleton className="h-96 w-full" />;

    return (
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-4xl font-bold">Orders</h1>
                <div className="flex gap-2">
                    <Button variant="outline"><FileSpreadsheet className="mr-2 h-4 w-4" /> Export to Excel</Button>
                    <Button onClick={() => setIsAddOrderOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                        <PlusCircle className="mr-2 h-4 w-4" /> Place Order
                    </Button>
                </div>
            </div>

            <div className="relative max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search orders..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
            </div>

            <div className="rounded-md border bg-white shadow-sm overflow-x-auto">
                <Table>
                    <TableHeader><TableRow><TableHead>Order ID</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-center">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {orders.filter(o => o.status !== 'Deleted' && (o.id.toLowerCase().includes(searchQuery.toLowerCase()) || o.customerName.toLowerCase().includes(searchQuery.toLowerCase()))).map(order => (
                            <TableRow key={order.id}>
                                <TableCell className="font-medium">{order.id}</TableCell>
                                <TableCell>{order.customerName}</TableCell>
                                <TableCell>{new Date(order.orderDate).toLocaleDateString('en-IN')}</TableCell>
                                <TableCell><Badge variant="secondary">{order.status}</Badge></TableCell>
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

            <AddOrderDialog
                isOpen={isAddOrderOpen || !!orderToEdit}
                onOpenChange={(open: boolean) => { if (!open) { setIsAddOrderOpen(false); setOrderToEdit(null); } }}
                customers={customers} products={products}
                onOrderAdded={async (d: any) => { await addOrder(d); await refreshData(); }}
                onOrderUpdated={async (d: any) => { await updateOrder(d); await refreshData(); }}
                existingOrder={orderToEdit}
            />
        </div>
    );
}

function AddOrderDialog({ isOpen, onOpenChange, customers, products, onOrderAdded, onOrderUpdated, existingOrder }: any) {
    const [customerId, setCustomerId] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<OrderItemState[]>([]);
    const [currentItem, setCurrentItem] = useState<OrderItemState>(initialItemState);
    const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>('Full Payment');
    const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
    const [isGstInvoice, setIsGstInvoice] = useState(true);
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [deliveryDate, setDeliveryDate] = useState('');
    const [deliveryFees, setDeliveryFees] = useState(0);
    const [discount, setDiscount] = useState(0);
    const [enableDiscount, setEnableDiscount] = useState(false);

    const isEditMode = !!existingOrder;

    useEffect(() => {
        if (isOpen && existingOrder) {
            setCustomerId(existingOrder.customerId);
            setOrderDate(new Date(existingOrder.orderDate).toISOString().split('T')[0]);
            setItems(existingOrder.items.map((i: any) => ({ ...i, quantity: String(i.quantity), price: String(i.price), gst: String(i.gst), totalWeight: String(i.totalWeight || '') })));
            setIsGstInvoice(existingOrder.isGstInvoice ?? true);
            setDeliveryAddress(existingOrder.deliveryAddress || '');
            setDeliveryDate(existingOrder.deliveryDate ? new Date(existingOrder.deliveryDate).toISOString().split('T')[0] : '');
            setPaymentTerm(existingOrder.paymentTerm || 'Full Payment');
        } else if (isOpen) {
            setCustomerId(''); setItems([]); setDeliveryAddress(''); setDeliveryDate('');
        }
    }, [isOpen, existingOrder]);

    const math = useMemo(() => {
        const itemsTotal = items.reduce((sum, i) => {
            const basis = isWeightBased(i.category) ? (parseFloat(i.totalWeight) || 0) : parseFloat(i.quantity);
            const lineBase = parseFloat(i.price) * basis;
            const lineGst = isGstInvoice ? lineBase * (parseFloat(i.gst) / 100) : 0;
            return sum + lineBase + lineGst;
        }, 0);
        const sub = itemsTotal + deliveryFees;
        const grand = sub - (enableDiscount ? discount : 0);
        return { itemsTotal, sub, grand };
    }, [items, isGstInvoice, deliveryFees, discount, enableDiscount]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl h-[95vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-4 border-b"><DialogTitle>Place New Order</DialogTitle></DialogHeader>
                <ScrollArea className="flex-1 p-4 bg-slate-50">
                    <div className="space-y-4">
                        {/* SCREENSHOT 1: ORDER DETAILS */}
                        <Card className="border shadow-none">
                            <CardContent className="p-6 space-y-4">
                                <h3 className="font-bold text-slate-800">Order Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                                    <div className="space-y-2">
                                        <Label>Customer Name</Label>
                                        <div className="flex gap-2">
                                            <Combobox options={customers.map((c:any) => ({ value: c.id, label: c.name }))} value={customerId} onValueChange={setCustomerId} placeholder="Select a customer" />
                                            <Button variant="outline" type="button">Add New</Button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Order Date</Label>
                                        <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2 pt-2">
                                    <Checkbox id="gst" checked={isGstInvoice} onCheckedChange={(v) => setIsGstInvoice(!!v)} className="data-[state=checked]:bg-blue-600 border-slate-300" />
                                    <Label htmlFor="gst" className="text-slate-600">Generate GST Invoice?</Label>
                                </div>
                                <div className="space-y-3">
                                    <Label className="text-slate-600">Payment Term</Label>
                                    <RadioGroup value={paymentTerm} onValueChange={(v:any) => setPaymentTerm(v)} className="flex gap-6">
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="Full Payment" id="fp" /><Label htmlFor="fp">Full Payment</Label></div>
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="Credit" id="cr" /><Label htmlFor="cr">Credit</Label></div>
                                    </RadioGroup>
                                </div>
                                <div className="space-y-2 max-w-md">
                                    <Label className="text-slate-600">Payment Mode</Label>
                                    <Select value={paymentMode} onValueChange={(v:any) => setPaymentMode(v)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="UPI">UPI</SelectItem></SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        {/* SCREENSHOT 1 & 2: ADD ITEMS */}
                        <Card className="border shadow-none">
                            <CardContent className="p-6 space-y-4">
                                <h3 className="font-bold text-slate-800">Add Items</h3>
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                                    <div className="md:col-span-2"><Label>Item Name</Label><Combobox options={products.map((p:any) => ({ value: p.id, label: p.name }))} value={currentItem.productId} onValueChange={(v) => {
                                        const p = products.find((x:any) => x.id === v);
                                        if(p) setCurrentItem({ ...currentItem, productId: p.id, stock: p.stock, price: String(p.salePrice), gst: String(p.gst), category: p.category, weightPerUnit: p.weightPerUnit || 0 });
                                    }} /></div>
                                    <div><Label>Stock</Label><Input value={currentItem.stock} readOnly className="bg-slate-50" /></div>
                                    <div><Label>Quantity</Label><Input type="number" value={currentItem.quantity} onChange={(e) => {
                                        const q = e.target.value;
                                        const w = isWeightBased(currentItem.category) ? (parseFloat(q) * currentItem.weightPerUnit).toFixed(2) : '';
                                        setCurrentItem({ ...currentItem, quantity: q, totalWeight: w });
                                    }} /></div>
                                    <div><Label>Sale Price</Label><Input type="number" value={currentItem.price} onChange={(e) => setCurrentItem({ ...currentItem, price: e.target.value })} /></div>
                                    <Button type="button" onClick={() => { if(currentItem.productId) { setItems([...items, currentItem]); setCurrentItem(initialItemState); } }} className="bg-blue-600">Add Item</Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* SCREENSHOT 2: ORDER ITEMS TABLE */}
                        <Card className="border shadow-none">
                            <CardContent className="p-6 space-y-4">
                                <h3 className="font-bold text-slate-800">Order Items</h3>
                                <Table className="border rounded-md">
                                    <TableHeader className="bg-slate-50/50"><TableRow>
                                        <TableHead>Item</TableHead><TableHead>Quantity</TableHead><TableHead>Total Wt.</TableHead><TableHead>Price</TableHead><TableHead>GST</TableHead><TableHead>Total</TableHead><TableHead>Actions</TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>
                                        {items.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center h-20 text-slate-400 italic">No items added yet</TableCell></TableRow> : items.map((it, idx) => {
                                            const basis = isWeightBased(it.category) ? parseFloat(it.totalWeight) : parseFloat(it.quantity);
                                            const rowBase = parseFloat(it.price) * basis;
                                            const rowGst = isGstInvoice ? rowBase * (parseFloat(it.gst)/100) : 0;
                                            return (
                                                <TableRow key={idx}>
                                                    <TableCell>{products.find(p=>p.id===it.productId)?.name}</TableCell>
                                                    <TableCell>{it.quantity}</TableCell>
                                                    <TableCell>{it.totalWeight || '-'}</TableCell>
                                                    <TableCell>{formatINR(parseFloat(it.price))}</TableCell>
                                                    <TableCell>{it.gst}%</TableCell>
                                                    <TableCell>{formatINR(rowBase + rowGst)}</TableCell>
                                                    <TableCell><Button variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        {/* SCREENSHOT 2: BOTTOM LOGISTICS & SUMMARY */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card className="border shadow-none">
                                <CardContent className="p-6 space-y-4">
                                    <h3 className="font-bold text-slate-800">Delivery Details</h3>
                                    <div className="space-y-2">
                                        <Label>Delivery Date</Label>
                                        <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Delivery Address</Label>
                                        <Textarea placeholder="Leave blank to use customer's default address" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} rows={3} />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border shadow-none">
                                <CardContent className="p-6 space-y-4">
                                    <h3 className="font-bold text-slate-800">Order Summary</h3>
                                    <div className="flex justify-between font-medium"><span>Current Items Total:</span><span>{formatINR(math.itemsTotal)}</span></div>
                                    <div className="flex justify-between items-center">
                                        <Label>Delivery Fees</Label>
                                        <Input type="number" className="w-24 text-right" value={deliveryFees} onChange={(e) => setDeliveryFees(parseFloat(e.target.value) || 0)} />
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center space-x-2"><Checkbox id="d" checked={enableDiscount} onCheckedChange={(v)=>setEnableDiscount(!!v)} /><Label htmlFor="d">Discount</Label></div>
                                        <Input type="number" className="w-24 text-right" disabled={!enableDiscount} value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} />
                                    </div>
                                    <Separator />
                                    <div className="flex justify-between font-medium"><span>Subtotal:</span><span>{formatINR(math.sub)}</span></div>
                                    <div className="flex justify-between text-xl font-bold text-blue-700 pt-2 border-t">
                                        <span>Grand Total:</span><span>{formatINR(math.grand)}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </ScrollArea>
                <DialogFooter className="p-4 border-t bg-white gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button className="bg-blue-600" onClick={async () => {
                        const data = { 
                            customerId, orderDate, deliveryDate, deliveryAddress, deliveryFees, discount: enableDiscount ? discount : 0, 
                            items: items.map(i => ({ ...i, quantity: parseFloat(i.quantity), price: parseFloat(i.price), totalWeight: parseFloat(i.totalWeight) || 0, gst: parseFloat(i.gst) })), 
                            grandTotal: math.grand, paymentTerm, isGstInvoice, customerName: customers.find((c:any)=>c.id===customerId)?.name, status: paymentTerm === 'Full Payment' ? 'Fulfilled' : 'Pending'
                        };
                        isEditMode ? await onOrderUpdated({ ...existingOrder, ...data }) : await onOrderAdded(data);
                        onOpenChange(false);
                    }}>Submit Order</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}