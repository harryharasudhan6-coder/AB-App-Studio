'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Order, Customer, Product, PaymentTerm, PaymentMode, CalculationType, ProductCategory, OrderItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, FileText, PlusCircle, Trash2, Edit, Share2, FileSpreadsheet, Search, ArrowUpDown } from 'lucide-react';
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

    useEffect(() => { if (orderToPrint) handlePrint(); }, [orderToPrint]);

    const handlePrint = async () => {
        if (!orderToPrint) return;
        try {
            const doc = new jsPDF() as jsPDFWithPlugin;
            const margin = 14;
            const pageWidth = doc.internal.pageSize.getWidth();

            doc.setFontSize(14).setFont('helvetica', 'bold').text("AB AGENCY - INVOICE", pageWidth / 2, 20, { align: 'center' });
            doc.setFontSize(9).setFont('helvetica', 'normal').text('No.1, Ayyanchery main road, Urapakkam, Chennai - 603210', pageWidth / 2, 26, { align: 'center' });

            const tableBody = orderToPrint.items.map(item => {
                const qty = item.quantity || 0;
                const weight = item.totalWeight || 0;
                const basis = isWeightBased(item.category) ? weight : qty;
                const baseTotal = item.price * basis;
                return [
                    item.productName,
                    `${qty} ${isWeightBased(item.category) ? 'nos' : 'pcs'}`,
                    formatINR(item.price),
                    orderToPrint.isGstInvoice ? `${item.gst}%` : '0%',
                    formatINR(baseTotal)
                ];
            });

            (doc as any).autoTable({
                startY: 50,
                head: [['Description', 'Qty', 'Rate', 'GST %', 'Amount']],
                body: tableBody,
                theme: 'grid',
                headStyles: { fillColor: [204, 229, 255], textColor: [0, 0, 0] }
            });

            let finalY = (doc as any).previousAutoTable.finalY + 10;

            // --- GST SPLIT LOGIC FOR INVOICE ---
            const baseTotal = orderToPrint.items.reduce((s, i) => s + (i.price * (i.totalWeight || i.quantity)), 0);
            const totalGst = orderToPrint.isGstInvoice ? orderToPrint.items.reduce((s, i) => s + (i.price * (i.totalWeight || i.quantity) * (i.gst / 100)), 0) : 0;

            doc.setFontSize(10).text(`Taxable Value: ${formatINR(baseTotal)}`, pageWidth - margin, finalY, { align: 'right' });
            finalY += 6;

            if (orderToPrint.isGstInvoice && totalGst > 0) {
                doc.text(`CGST (Split): ${formatINR(totalGst / 2)}`, pageWidth - margin, finalY, { align: 'right' });
                finalY += 6;
                doc.text(`SGST (Split): ${formatINR(totalGst / 2)}`, pageWidth - margin, finalY, { align: 'right' });
                finalY += 6;
            }

            doc.setFont('helvetica', 'bold').text(`Grand Total: ${formatINR(orderToPrint.grandTotal)}`, pageWidth - margin, finalY + 4, { align: 'right' });

            doc.save(`INV-${orderToPrint.id}.pdf`);
        } catch (e) { toast({ title: "Print Failed" }); }
        setOrderToPrint(null);
    };

    if (!isMounted) return <Skeleton className="h-96 w-full" />;

    return (
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-4xl font-bold">Orders</h1>
                <Button onClick={() => setIsAddOrderOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                    <PlusCircle className="mr-2 h-4 w-4" /> Place Order
                </Button>
            </div>

            <div className="relative max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search orders..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
            </div>

            <div className="rounded-md border bg-white shadow-sm overflow-x-auto">
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
                                <TableCell className="font-medium">{order.id}</TableCell>
                                <TableCell>{order.customerName}</TableCell>
                                <TableCell>{new Date(order.orderDate).toLocaleDateString('en-IN')}</TableCell>
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
                onOpenChange={(open: boolean) => { if (!open) { setIsAddOrderOpen(false); setOrderToEdit(null); } }}
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
    const [isGstInvoice, setIsGstInvoice] = useState(false);
    const [deliveryFees, setDeliveryFees] = useState(0);
    const [discount, setDiscount] = useState(0);

    const isEditMode = !!existingOrder;

    useEffect(() => {
        if (isOpen && existingOrder) {
            setCustomerId(existingOrder.customerId);
            setOrderDate(new Date(existingOrder.orderDate).toISOString().split('T')[0]);
            setItems(existingOrder.items.map((i: any) => ({ ...i, quantity: String(i.quantity), price: String(i.price), gst: String(i.gst || 0), totalWeight: String(i.totalWeight || '') })));
            setIsGstInvoice(existingOrder.isGstInvoice ?? false);
        } else if (isOpen) {
            setCustomerId(''); setItems([]);
        }
    }, [isOpen, existingOrder]);

    // --- MATH ENGINE WITH GST TOTAL ADDITION ---
    const math = useMemo(() => {
        const taxableTotal = items.reduce((sum, i) => {
            const qty = parseFloat(i.quantity) || 0;
            const weight = parseFloat(i.totalWeight) || 0;
            const basis = isWeightBased(i.category) ? weight : qty;
            return sum + (parseFloat(i.price) * basis);
        }, 0);

        const gstTotal = isGstInvoice ? items.reduce((sum, i) => {
            const qty = parseFloat(i.quantity) || 0;
            const weight = parseFloat(i.totalWeight) || 0;
            const basis = isWeightBased(i.category) ? weight : qty;
            const gstRate = parseFloat(i.gst) || 0;
            return sum + (parseFloat(i.price) * basis * (gstRate / 100));
        }, 0) : 0;

        const subTotal = taxableTotal + gstTotal + deliveryFees - discount;
        return { taxableTotal, gstTotal, subTotal };
    }, [items, isGstInvoice, deliveryFees, discount]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl h-[95vh] flex flex-col p-0">
                <DialogHeader className="p-4 border-b bg-slate-50"><DialogTitle>New Order</DialogTitle></DialogHeader>
                <ScrollArea className="flex-1 p-6">
                    <form className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card className="p-4 space-y-4">
                                <Label className="font-bold underline">1. CUSTOMER INFO</Label>
                                <Combobox options={customers.map((c: any) => ({ value: c.id, label: c.name }))} value={customerId} onValueChange={setCustomerId} />
                                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                            </Card>
                            <Card className="p-4 space-y-4">
                                <Label className="font-bold underline">2. GST & PAYMENT</Label>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="gst" checked={isGstInvoice} onCheckedChange={(v) => setIsGstInvoice(!!v)} />
                                    <Label htmlFor="gst" className="text-blue-700 font-bold">Apply GST to this Order</Label>
                                </div>
                                <RadioGroup value={paymentTerm} onValueChange={(v:any) => setPaymentTerm(v)} className="flex gap-4">
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="Full Payment" id="f" /><Label htmlFor="f">Full Payment</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="Credit" id="c" /><Label htmlFor="c">Credit</Label></div>
                                </RadioGroup>
                            </Card>
                        </div>

                        <Card className="p-4 space-y-4 border-blue-200 bg-blue-50/10">
                            <Label className="font-bold underline">3. ADD ITEMS</Label>
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                                <div className="md:col-span-4"><Label>Product</Label><Combobox options={products.map((p:any) => ({ value: p.id, label: p.name }))} value={currentItem.productId} onValueChange={(v) => {
                                    const p = products.find((x:any) => x.id === v);
                                    if(p) setCurrentItem({ ...currentItem, productId: p.id, stock: p.stock, price: String(p.salePrice), gst: String(p.gst), category: p.category, weightPerUnit: p.weightPerUnit || 0 });
                                }} /></div>
                                <div className="md:col-span-2"><Label>Qty</Label><Input type="number" value={currentItem.quantity} onChange={(e) => {
                                    const q = e.target.value;
                                    setCurrentItem({ ...currentItem, quantity: q, totalWeight: isWeightBased(currentItem.category) ? (parseFloat(q) * currentItem.weightPerUnit).toFixed(2) : '' });
                                }} /></div>
                                <div className="md:col-span-2"><Label>Price</Label><Input type="number" value={currentItem.price} onChange={(e) => setCurrentItem({ ...currentItem, price: e.target.value })} /></div>
                                <div className="md:col-span-2"><Button type="button" onClick={() => { if(currentItem.productId) { setItems([...items, currentItem]); setCurrentItem(initialItemState); } }} className="w-full bg-blue-600 text-white">Add</Button></div>
                            </div>
                            <Table className="bg-white border rounded-md">
                                <TableHeader className="bg-slate-100"><TableRow>
                                    <TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Taxable</TableHead><TableHead>GST</TableHead><TableHead className="text-right">Total</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>{items.map((it, idx) => {
                                    const basis = isWeightBased(it.category) ? parseFloat(it.totalWeight) : parseFloat(it.quantity);
                                    const lineTaxable = parseFloat(it.price) * basis;
                                    const lineGst = isGstInvoice ? lineTaxable * (parseFloat(it.gst) / 100) : 0;
                                    return (
                                        <TableRow key={idx}>
                                            <TableCell>{products.find(p=>p.id===it.productId)?.name}</TableCell>
                                            <TableCell>{it.quantity}</TableCell>
                                            <TableCell>{formatINR(lineTaxable)}</TableCell>
                                            <TableCell>{it.gst}% ({formatINR(lineGst)})</TableCell>
                                            <TableCell className="text-right">{formatINR(lineTaxable + lineGst)}</TableCell>
                                        </TableRow>
                                    );
                                })}</TableBody>
                            </Table>
                        </Card>

                        <Card className="p-4 space-y-2 bg-slate-50 ml-auto max-w-md border">
                            <div className="flex justify-between"><span>Taxable Value:</span><span>{formatINR(math.taxableTotal)}</span></div>
                            <div className="flex justify-between text-blue-700"><span>Total GST:</span><span>+ {formatINR(math.gstTotal)}</span></div>
                            <div className="flex justify-between items-center"><span>Delivery:</span><Input className="w-20 h-8" type="number" value={deliveryFees} onChange={(e)=>setDeliveryFees(parseFloat(e.target.value)||0)} /></div>
                            <Separator />
                            <div className="flex justify-between text-xl font-bold"><span>Grand Total:</span><span className="text-primary">{formatINR(math.subTotal)}</span></div>
                        </Card>
                    </form>
                </ScrollArea>
                <DialogFooter className="p-4 border-t bg-white gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button className="bg-blue-600" onClick={async () => {
                        const data = { 
                            customerId, orderDate, items: items.map(i => ({ ...i, quantity: parseFloat(i.quantity), price: parseFloat(i.price), totalWeight: parseFloat(i.totalWeight) || 0, gst: parseFloat(i.gst) })), 
                            grandTotal: math.subTotal, paymentTerm, isGstInvoice, customerName: customers.find((c:any)=>c.id===customerId)?.name, status: paymentTerm === 'Full Payment' ? 'Fulfilled' : 'Pending'
                        };
                        isEditMode ? await onOrderUpdated({ ...existingOrder, ...data }) : await onOrderAdded(data);
                        onOpenChange(false);
                    }}>Confirm Order</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}