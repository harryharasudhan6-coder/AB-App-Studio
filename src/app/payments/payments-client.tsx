
'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Order, Payment, PaymentMode, Customer } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Receipt, Trash2, Share2, ArrowUpDown } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import ReceiptTemplate from '@/components/receipt-template';
import { addPaymentToOrder, getOrders, getCustomers } from '@/lib/data';
import { Skeleton } from '@/components/ui/skeleton';

type SortKey = keyof Order | 'id' | 'customerName' | 'orderDate' | 'status' | 'balanceDue' | 'grandTotal';

const formatNumber = (value: number | undefined) => {
    if (value === undefined || isNaN(value)) return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(0);
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', currencyDisplay: 'symbol' }).format(value);
};

const PaymentsTable = ({ invoices, onRowClick, sortConfig, requestSort }: { 
    invoices: Order[], 
    onRowClick?: (invoice: Order) => void,
    sortConfig: { key: SortKey; direction: 'ascending' | 'descending' } | null,
    requestSort: (key: SortKey) => void
}) => (
    <div className="rounded-lg border shadow-sm">
        <Table>
            <TableHeader>
                <TableRow>
                     <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('id')}>Invoice ID <ArrowUpDown className="ml-2 h-4 w-4" /></Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('customerName')}>Customer <ArrowUpDown className="ml-2 h-4 w-4" /></Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('orderDate')}>Date <ArrowUpDown className="ml-2 h-4 w-4" /></Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('status')}>Status <ArrowUpDown className="ml-2 h-4 w-4" /></Button>
                    </TableHead>
                    <TableHead className="text-right">
                        <Button variant="ghost" onClick={() => requestSort('balanceDue')}>Balance Due <ArrowUpDown className="ml-2 h-4 w-4" /></Button>
                    </TableHead>
                    <TableHead className="text-right">
                        <Button variant="ghost" onClick={() => requestSort('grandTotal')}>Total <ArrowUpDown className="ml-2 h-4 w-4" /></Button>
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {invoices.map((invoice) => (
                    <TableRow key={invoice.id} onClick={() => onRowClick?.(invoice)} className="cursor-pointer">
                        <TableCell className="font-medium">{invoice.id.replace('ORD', 'INV')}</TableCell>
                        <TableCell>{invoice.customerName}</TableCell>
                        <TableCell>{new Date(invoice.orderDate).toLocaleDateString('en-IN')}</TableCell>
                        <TableCell>
                            <Badge variant={invoice.status === 'Fulfilled' ? 'default' : invoice.status === 'Pending' ? 'secondary' : invoice.status === 'Part Payment' ? 'outline' : 'destructive'} className="capitalize">{invoice.status}</Badge>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${invoice.balanceDue && invoice.balanceDue > 0 ? 'text-red-600' : ''}`}>
                            {formatNumber(invoice.balanceDue)}
                        </TableCell>
                        <TableCell className="text-right">
                            {formatNumber(invoice.grandTotal)}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </div>
);


export function PaymentsClient({ orders: initialOrders, customers: initialCustomers }: { orders: Order[], customers: Customer[] }) {
    const [allInvoices, setAllInvoices] = useState<Order[]>(initialOrders);
    const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
    const [selectedInvoice, setSelectedInvoice] = useState<Order | null>(null);
    const [receiptToPrint, setReceiptToPrint] = useState<{order: Order, payment: Payment, historicalPayments: Payment[]} | null>(null);
    const [isReceiptLoading, setIsReceiptLoading] = useState(false);
    const { toast } = useToast();
    const receiptRef = useRef<HTMLDivElement>(null);
    const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
    const [isMounted, setIsMounted] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' } | null>(null);


    useEffect(() => {
        setIsMounted(true);
        const savedLogo = localStorage.getItem('companyLogo');
        if (savedLogo) {
            setLogoUrl(savedLogo);
        }
    }, []);

    const requestSort = (key: SortKey) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

     const sortedInvoices = useMemo(() => {
        let sortableItems = [...allInvoices];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];

                if (aValue === undefined || aValue === null) return 1;
                if (bValue === undefined || bValue === null) return -1;
                
                 if (sortConfig.key === 'orderDate') {
                    const dateA = new Date(aValue as string).getTime();
                    const dateB = new Date(bValue as string).getTime();
                    return sortConfig.direction === 'ascending' ? dateA - dateB : dateB - dateA;
                }
                
                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
                }
                
                const strA = String(aValue).toLowerCase();
                const strB = String(bValue).toLowerCase();

                if (strA < strB) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (strA > strB) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [allInvoices, sortConfig]);

    const { fullPaidInvoices, creditInvoices } = useMemo(() => {
        const fullPaid = sortedInvoices.filter(order => order.status === 'Fulfilled');
        // Only show orders that have a partial payment
        const credit = sortedInvoices.filter(order => order.status === 'Part Payment');
        return { fullPaidInvoices: fullPaid, creditInvoices: credit };
    }, [sortedInvoices]);

    const refreshData = async () => {
        const [orders, refreshedCustomers] = await Promise.all([getOrders(), getCustomers()]);
        setAllInvoices(orders);
        setCustomers(refreshedCustomers);
        // After refresh, find and update the selectedInvoice to show new data in the sheet
        if (selectedInvoice) {
            const updatedSelectedInvoice = orders.find(o => o.id === selectedInvoice.id);
            setSelectedInvoice(updatedSelectedInvoice || null);
        }
    };
    
    const handleAddPayment = async (payment: Omit<Payment, 'id'>) => {
        if (!selectedInvoice) return;
        
        try {
            await addPaymentToOrder(selectedInvoice.id, payment);
            toast({
                title: 'Payment Recorded',
                description: `${formatNumber(payment.amount)} payment for invoice ${selectedInvoice.id.replace('ORD','INV')} has been recorded.`,
            });
            await refreshData();
        } catch(e: any) {
            toast({
                title: 'Error',
                description: e.message || 'Failed to record payment.',
                variant: 'destructive'
            });
        }
    };

    const handleGenerateReceipt = async (payment: Payment) => {
        if (!selectedInvoice || !selectedInvoice.payments) return;
        setIsReceiptLoading(true);

        const paymentDate = new Date(payment.paymentDate);
        const historicalPayments = selectedInvoice.payments
            .filter(p => new Date(p.paymentDate) <= paymentDate)
            .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime());

        setReceiptToPrint({ order: selectedInvoice, payment, historicalPayments });
    };

    useEffect(() => {
        if (receiptToPrint) {
            setTimeout(() => {
                handlePrintReceipt();
            }, 100);
        }
    }, [receiptToPrint]);

    const handleWhatsAppShare = (payment: Payment) => {
        if (!selectedInvoice) return;
        const customer = customers.find(c => c.id === selectedInvoice.customerId);
        if (!customer || !customer.phone) {
            toast({ title: 'Error', description: "Customer's phone number is not available.", variant: 'destructive'});
            return;
        }

        const sanitizedPhone = customer.phone.replace(/\D/g, '');
        const formattedAmount = formatNumber(payment.amount).replace(/\u00A0/g, ' '); 
        const message = `Hello ${customer.name}, here is the receipt for your payment of ${formattedAmount} towards invoice ${selectedInvoice.id.replace('ORD', 'INV')}. Thank you!`;
        const whatsappUrl = `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(message)}`;
        
        window.open(whatsappUrl, '_blank');
    };


    const handlePrintReceipt = async () => {
        if (!receiptToPrint || !receiptRef.current) return;
        
        try {
            const canvas = await html2canvas(receiptRef.current, { scale: 3, useCORS: true });
            const imgData = canvas.toDataURL('image/png');
            
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const canvasAspectRatio = canvas.width / canvas.height;
            const pdfHeight = pdfWidth / canvasAspectRatio;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`receipt-${receiptToPrint.payment.id.replace(receiptToPrint.order.id + '-', '')}.pdf`);

            toast({ title: 'Success', description: 'Receipt PDF has been downloaded.' });
        } catch (error) {
            console.error('Failed to generate receipt:', error);
            toast({ title: 'Error', description: 'Failed to generate receipt PDF.', variant: 'destructive'});
        } finally {
            setIsReceiptLoading(false);
            setReceiptToPrint(null);
        }
    };
    
    const customerForReceipt = useMemo(() => {
        if (!receiptToPrint) return null;
        return customers.find(c => c.id === receiptToPrint.order.customerId) || null;
    }, [receiptToPrint, customers]);

    if (!isMounted) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-8 w-64" />
                <div className="rounded-lg border shadow-sm p-4">
                    <Skeleton className="h-8 w-full mb-4" />
                    <Skeleton className="h-8 w-full mb-2" />
                    <Skeleton className="h-8 w-full mb-2" />
                    <Skeleton className="h-8 w-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h1 className="text-3xl font-bold">Payments</h1>
            <Tabs defaultValue="credit">
                <TabsList>
                    <TabsTrigger value="credit">Credit Payment</TabsTrigger>
                    <TabsTrigger value="full-paid">Full Payment</TabsTrigger>
                </TabsList>
                <TabsContent value="full-paid">
                    <PaymentsTable invoices={fullPaidInvoices} onRowClick={setSelectedInvoice} sortConfig={sortConfig} requestSort={requestSort} />
                </TabsContent>
                <TabsContent value="credit">
                    <PaymentsTable invoices={creditInvoices} onRowClick={setSelectedInvoice} sortConfig={sortConfig} requestSort={requestSort} />
                </TabsContent>
            </Tabs>

            <Sheet open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
                <SheetContent className="sm:max-w-lg w-[90vw] flex flex-col">
                    {selectedInvoice && (
                        <>
                        <SheetHeader>
                            <SheetTitle>Invoice: {selectedInvoice.id.replace('ORD','INV')}</SheetTitle>
                            <SheetDescription>
                                Manage payments for {selectedInvoice.customerName}.
                            </SheetDescription>
                        </SheetHeader>
                        <div className="space-y-6 py-4 overflow-y-auto flex-1 pr-6">
                             <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Previous Balance:</span>
                                <span>{formatNumber(selectedInvoice.previousBalance)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Current Bill:</span>
                                <span>{formatNumber(selectedInvoice.total)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-lg">
                                <span className="text-muted-foreground">Total:</span>
                                <span>{formatNumber(selectedInvoice.grandTotal)}</span>
                            </div>
                             <div className="flex justify-between font-bold text-lg">
                                <span className="text-red-600">Balance Due:</span>
                                <span className="text-red-600">{formatNumber(selectedInvoice.balanceDue)}</span>
                            </div>

                            <Separator />
                            
                            {selectedInvoice.balanceDue && selectedInvoice.balanceDue > 0 && (
                                <PaymentForm 
                                    balanceDue={selectedInvoice.balanceDue || 0}
                                    onAddPayment={handleAddPayment} 
                                />
                            )}
                           

                            <Separator />

                            <div className="space-y-2">
                               <h4 className="font-medium">Payment History</h4>
                                <div className="space-y-4 max-h-[40vh] overflow-y-auto p-1">
                                    {(selectedInvoice.payments && selectedInvoice.payments.length > 0) ? (
                                        selectedInvoice.payments.map(payment => (
                                             <div key={payment.id} className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded-lg">
                                                <div>
                                                    <p className="font-medium">{formatNumber(payment.amount)}</p>
                                                    <p className="text-xs text-muted-foreground">{new Date(payment.paymentDate).toLocaleDateString('en-IN')} via {payment.method}</p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button size="sm" variant="outline" onClick={() => handleGenerateReceipt(payment)} disabled={isReceiptLoading}>
                                                        {isReceiptLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
                                                        <span>Receipt</span>
                                                    </Button>
                                                     <Button size="sm" variant="outline" onClick={() => handleWhatsAppShare(payment)} >
                                                        <Share2 className="mr-2 h-4 w-4" />
                                                        <span>Share</span>
                                                    </Button>
                                                </div>
                                             </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center py-4">No payments recorded yet.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            {receiptToPrint && customerForReceipt && (
                <div style={{ position: 'fixed', left: '-200vw', top: 0, zIndex: -1 }}>
                    <ReceiptTemplate 
                        ref={receiptRef}
                        order={receiptToPrint.order}
                        customer={customerForReceipt}
                        payment={receiptToPrint.payment}
                        historicalPayments={receiptToPrint.historicalPayments}
                        logoUrl={logoUrl}
                    />
                </div>
            )}
        </div>
    );
}


function PaymentForm({ balanceDue, onAddPayment }: { balanceDue: number; onAddPayment: (payment: Omit<Payment, 'id'>) => void }) {
    const [amount, setAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMode>('Cash');
    const [notes, setNotes] = useState('');
    const { toast } = useToast();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const paymentAmount = parseFloat(amount);
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            toast({ title: "Invalid Amount", description: "Please enter a valid payment amount.", variant: "destructive" });
            return;
        }
        if (paymentAmount > balanceDue) {
            toast({ title: "Overpayment Error", description: `Payment of ${formatNumber(paymentAmount)} cannot be greater than the balance due of ${formatNumber(balanceDue)}.`, variant: "destructive" });
            return;
        }
        
        onAddPayment({
            amount: paymentAmount,
            paymentDate,
            method: paymentMethod,
            notes,
        });

        // Reset form
        setAmount('');
        setNotes('');
    };

    return (
        <Card>
            <form onSubmit={handleSubmit}>
                <CardHeader>
                    <CardTitle>Record a Payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="amount">Amount Received</Label>
                        <Input id="amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder={String(balanceDue)} max={balanceDue} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="paymentDate">Payment Date</Label>
                            <Input id="paymentDate" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="paymentMethod">Payment Method</Label>
                            <Select value={paymentMethod} onValueChange={v => setPaymentMethod(v as PaymentMode)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Cash">Cash</SelectItem>
                                    <SelectItem value="Card">Card</SelectItem>
                                    <SelectItem value="UPI">UPI</SelectItem>
                                    <SelectItem value="Cheque">Cheque</SelectItem>
                                    <SelectItem value="Online Transfer">Online Transfer</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="notes">Notes (Optional)</Label>
                        <Input id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Cheque No. 12345" />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button type="submit" className="w-full">Record Payment</Button>
                </CardFooter>
            </form>
        </Card>
    );
}
