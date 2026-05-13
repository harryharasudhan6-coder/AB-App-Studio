'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Order, Customer, Product, PaymentTerm, PaymentMode, CalculationType, ProductCategory, OrderItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, FileText, PlusCircle, Trash2, Edit, Share2, FileSpreadsheet, Search, ArrowUpDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
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
    const [dateFilter, setDateFilter] = useState('All Time');
    const [isMounted, setIsMounted] = useState(false);
    const { toast } = useToast();

    useEffect(() => { setIsMounted(true); }, []);

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
        try {
            const doc = new jsPDF() as jsPDFWithPlugin;
            doc.text(`Invoice: ${orderToPrint.id}`, 14, 20);
            // Full detailed PDF logic goes here
            doc.save(`INV-${orderToPrint.id}.pdf`);
        } catch (e) { toast({ title: "Print Failed" }); }
        setOrderToPrint(null);
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

            {/* --- SEARCH & FILTERS (Screenshot 1) --- */}
            <div className="flex gap-4 items-center">
                <div className="relative flex-1">
                    <Input 
                        placeholder="Search by Order ID or Customer Name..." 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        className="w-full"
                    />
                </div>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All Time">All Time</SelectItem>
                        <SelectItem value="This Month">This Month</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="rounded-md border bg-white shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Order ID <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                            <TableHead>Customer <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                            <TableHead>Date <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                            <TableHead>Status <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                            <TableHead className="text-right">Total <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                            <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredOrders.map(order => (
                            <TableRow key={order.id}>
                                <TableCell className="font-medium">{order.id}</TableCell>
                                <TableCell>{order.customerName}</TableCell>
                                <TableCell>{new Date(order.orderDate).toLocaleDateString('en-IN')}</TableCell>
                                <TableCell>
                                    <Badge variant="secondary" className="rounded-full px-3">{order.status}</Badge>
                                </TableCell>
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
                customers={customers} products={products}
                onOrderAdded={async (d: any) => { await addOrder(d); await refreshData(); }}
                onOrderUpdated={async (d: any) => { await updateOrder(d); await refreshData(); }}
                onCustomerAdded={async (d: any) => { const c = await addCustomer(d); await refreshData(); return c; }}
                existingOrder={orderToEdit}
            />
        </div>
    );
}

function AddOrderDialog({ isOpen, onOpenChange, customers, products, onOrderAdded, onOrderUpdated, onCustomerAdded, existingOrder }: any) {
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
            setItems(existingOrder.items.map((i: any) => ({ ...i, quantity: String(i.quantity), price: String(i.price), totalWeight: String(i.totalWeight || '') })));
            setIsGstInvoice(existingOrder.isGstInvoice ?? true);
            setDeliveryAddress(existingOrder.deliveryAddress || '');
            setPaymentTerm(existingOrder.paymentTerm || 'Full Payment');
        } else if (isOpen) {
            setCustomerId(''); setItems([]); setDeliveryAddress(''); setDeliveryFees(0); setDiscount(0);
        }
    }, [isOpen, existingOrder]);

    const math = useMemo(() => {
        const total = items.reduce((sum, i) => sum + (parseFloat(i.price) * (parseFloat(i.totalWeight) || parseFloat(i.quantity))), 0);
        const sub = total + deliveryFees - discount;
        return { total, sub };
    }, [items, deliveryFees, discount]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl h-[95vh] flex flex-col p-0">
                <DialogHeader className="p-4 border-b"><DialogTitle>Place New Order</DialogTitle></DialogHeader>
                <ScrollArea className="flex-1 p-6 bg-slate-50">
                    <form className="space-y-6">
                        {/* SECTION 1: ORDER DETAILS (Screenshot 2) */}
                        <Card className="shadow-sm">
                            <CardContent className="p-6 space-y-4">
                                <h3 className="font-bold text-lg">Order Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label>Customer Name</Label>
                                        <div className="flex gap-2">
                                            <Combobox options={customers.map((c:any) => ({ value: c.id, label: c.name }))} value={customerId} onValueChange={setCustomerId} />
                                            <Button type="button" variant="outline">Add New</Button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Order Date</Label>
                                        <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2 py-2">
                                    <Checkbox id="gst" checked={isGstInvoice} onCheckedChange={(v) => setIsGstInvoice(!!v)} />
                                    <Label htmlFor="gst" className="font-medium text-blue-800">Generate GST Invoice?</Label>
                                </div>
                                <div className="space-y-2">
                                    <Label className="block mb-2 font-semibold">Payment Term</Label>
                                    <RadioGroup value={paymentTerm} onValueChange={(v:any) => setPaymentTerm(v)} className="flex gap-6">
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="Full Payment" id="f" /><Label htmlFor="f">Full Payment</Label></div>
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="Credit" id="c" /><Label htmlFor="c">Credit</Label></div>
                                    </RadioGroup>
                                </div>
                                <div className="space-y-2 w-1/2">
                                    <Label>Payment Mode</Label>
                                    <Select value={paymentMode} onValueChange={(v:any) => setPaymentMode(v)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="UPI">UPI</SelectItem></SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        {/* SECTION 2: ADD ITEMS (Screenshot 3) */}
                        <Card className="shadow-sm">
                            <CardContent className="p-6 space-y-4">
                                <h3 className="font-bold text-lg">Add Items</h3>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                                    <div className="md:col-span-1"><Label>Item Name</Label><Combobox options={products.map((p:any) => ({ value: p.id, label: p.name }))} value={currentItem.productId} onValueChange={(v) => {
                                        const p = products.find((x:any) => x.id === v);
                                        if(p) setCurrentItem({ ...currentItem, productId: p.id, stock: p.stock, price: String(p.salePrice) });
                                    }} /></div>
                                    <div><Label>Stock</Label><Input value={currentItem.stock} disabled /></div>
                                    <div><Label>Quantity</Label><Input type="number" value={currentItem.quantity} onChange={(e) => setCurrentItem({ ...currentItem, quantity: e.target.value })} /></div>
                                    <div><Label>Sale Price</Label><Input type="number" value={currentItem.price} onChange={(e) => setCurrentItem({ ...currentItem, price: e.target.value })} /></div>
                                    <Button type="button" className="bg-blue-600" onClick={() => { if(currentItem.productId) { setItems([...items, currentItem]); setCurrentItem(initialItemState); } }}>Add Item</Button>
                                </div>
                                <div className="mt-6">
                                    <h4 className="font-semibold mb-2">Order Items</h4>
                                    <Table className="border rounded-md">
                                        <TableHeader className="bg-slate-50"><TableRow>
                                            <TableHead>Item</TableHead><TableHead>Quantity</TableHead><TableHead>Total Wt.</TableHead><TableHead>Price</TableHead><TableHead>GST</TableHead><TableHead>Total</TableHead><TableHead>Actions</TableHead>
                                        </TableRow></TableHeader>
                                        <TableBody>{items.map((it, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell>{products.find(p=>p.id===it.productId)?.name}</TableCell>
                                                <TableCell>{it.quantity}</TableCell>
                                                <TableCell>{it.totalWeight || '-'}</TableCell>
                                                <TableCell>{it.price}</TableCell>
                                                <TableCell>{it.gst}%</TableCell>
                                                <TableCell>{formatINR(parseFloat(it.price) * parseFloat(it.quantity))}</TableCell>
                                                <TableCell><Button variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button></TableCell>
                                            </TableRow>
                                        ))}</TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>

                        {/* SECTION 3: DELIVERY & SUMMARY (Screenshot 3 Bottom) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="shadow-sm">
                                <CardContent className="p-6 space-y-4">
                                    <h3 className="font-bold text-lg">Delivery Details</h3>
                                    <div className="space-y-2">
                                        <Label>Delivery Date</Label>
                                        <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Delivery Address</Label>
                                        <Textarea placeholder="Leave blank to use customer's default address" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="shadow-sm">
                                <CardContent className="p-6 space-y-4">
                                    <h3 className="font-bold text-lg">Order Summary</h3>
                                    <div className="flex justify-between"><span>Current Items Total:</span><span className="font-bold">{formatINR(math.total)}</span></div>
                                    <div className="flex justify-between items-center gap-4">
                                        <Label>Delivery Fees</Label>
                                        <Input type="number" className="w-24" value={deliveryFees} onChange={(e) => setDeliveryFees(parseFloat(e.target.value) || 0)} />
                                    </div>
                                    <div className="flex justify-between items-center gap-4">
                                        <div className="flex items-center space-x-2"><Checkbox id="disc" checked={enableDiscount} onCheckedChange={(v)=>setEnableDiscount(!!v)} /><Label htmlFor="disc">Discount</Label></div>
                                        <Input type="number" className="w-24" disabled={!enableDiscount} value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} />
                                    </div>
                                    <Separator />
                                    <div className="flex justify-between text-lg font-bold"><span>Subtotal:</span><span>{formatINR(math.sub)}</span></div>
                                </CardContent>
                            </Card>
                        </div>
                    </form>
                </ScrollArea>
                <DialogFooter className="p-4 border-t bg-white gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={async () => {
                        const data = { 
                            customerId, orderDate, items: items.map(i => ({ ...i, quantity: parseFloat(i.quantity), price: parseFloat(i.price) })), 
                            grandTotal: math.sub, paymentTerm, isGstInvoice, deliveryAddress, deliveryDate, deliveryFees, discount,
                            customerName: customers.find(c=>c.id===customerId)?.name, status: paymentTerm === 'Full Payment' ? 'Fulfilled' : 'Pending'
                        };
                        isEditMode ? await onOrderUpdated({ ...existingOrder, ...data }) : await onOrderAdded(data);
                        onOpenChange(false);
                    }} className="bg-blue-600 hover:bg-blue-700">Submit Order</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}