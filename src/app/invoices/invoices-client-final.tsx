'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Order, Payment, PaymentMode, Customer, SortKey } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
// Note: Keeping icons imported for external use (e.g., table headers, Loader)
import { Loader2, Receipt, Trash2, Share2, ArrowUpDown, MoreHorizontal, Edit } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

// Placeholder utility functions (replace with your actual data and logic imports)
// NOTE: These are assumed to be imported from your backend data layer (e.g., src/lib/data.ts)
const addPaymentToOrder = (customerId: string, orderId: string, paymentData: Omit<Payment, 'id'>) => {
    console.log(`[DATA] Recording payment for Order ID: ${orderId}`);
    // This is where the actual API call logic goes
    return Promise.resolve({ id: 'P-' + Date.now(), ...paymentData });
};
const deletePaymentFromOrder = (orderId: string, paymentId: string) => {
    console.log(`[DATA] Deleting payment ${paymentId} from Order ID: ${orderId}`);
    // Actual delete logic
    return Promise.resolve(true);
};
const formatNumber = (num: number) => num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatCurrency = (num: number) => `₹ ${formatNumber(num)}`;
const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

// Placeholder component for Receipt (MUST be replaced with your actual component)
const ReceiptTemplate = ({ receiptRef, order, payment, historicalPayments, customer, logoUrl }: any) => (
    <div ref={receiptRef} className="p-6 border rounded-lg bg-white text-sm" id="receipt-template">
        <h3 className="text-lg font-bold">Receipt for {order.id}</h3>
        <p>Customer: {customer?.name || 'N/A'}</p>
        <p>Amount Paid: {formatCurrency(payment.amount)}</p>
        <p>Balance Due: {formatCurrency(order.balanceDue)}</p>
        {/* Placeholder for actual receipt layout and printing logic */}
    </div>
);

import { getInvoices } from "@/lib/data"; // make sure this import exists at the top

const useInvoiceData = () => {
  const [allInvoices, setAllInvoices] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch invoices from Firestore
  const refreshOrders = async () => {
    try {
      setLoading(true);
      const invoices = await getInvoices(); // ✅ uses Firestore now
      setAllInvoices(invoices);
      console.log(`Fetched ${invoices.length} invoices from Firestore`);
    } catch (error) {
      console.error("Failed to fetch invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  // Run once on mount
  useEffect(() => {
    refreshOrders();
  }, []);

  return { allInvoices, customers, refreshOrders, loading };
};


// ------------------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------------------

export const InvoicesClient = ({ logoUrl }: { logoUrl?: string }) => {
    const { allInvoices, customers, refreshOrders } = useInvoiceData();
    const { toast } = useToast();

    // --- NEW PAYMENT FORM STATE (Fixes Issue 1: Date and Notes) ---
    const [paymentAmount, setPaymentAmount] = useState<string>('');
    const [paymentMethod, setPaymentMode] = useState<PaymentMode>('Cash'); 
    const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]); 
    const [paymentNotes, setPaymentNotes] = useState<string>(''); 
    const [isPaymentLoading, setIsPaymentLoading] = useState(false);
    
    // --- TABLE STATE ---
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey | null, direction: 'ascending' | 'descending' }>({ key: null, direction: 'ascending' });
    
    // --- SHEET/MODAL STATE ---
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Order | null>(null);
    const [receiptToPrint, setReceiptToPrint] = useState<{ order: Order, payment: Payment, historicalPayments: Payment[] } | null>(null);
    const receiptRef = useRef<HTMLDivElement>(null);
    const [tabValue, setTabValue] = useState('details');

    // Filter and Sort Logic
    const filteredInvoices = useMemo(() => {
        let filtered = allInvoices.filter(invoice =>
            invoice.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase())
        );

        // Sorting Logic
        if (sortConfig.key) {
            filtered.sort((a, b) => {
                const aValue = a[sortConfig.key!];
                const bValue = b[sortConfig.key!];

                if (aValue === undefined || aValue === null) return 1;
                if (bValue === undefined || bValue === null) return -1;
                
                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
                }
                if (typeof aValue === 'string' && typeof bValue === 'string') {
                    return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
                }
                return 0;
            });
        }
        return filtered;
    }, [allInvoices, searchTerm, sortConfig]);

    const requestSort = (key: SortKey) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: SortKey) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
    };


    // --------------------------------------------------------------------------------
    // --- PAYMENT HANDLERS ---
    // --------------------------------------------------------------------------------

    // ⭐️ PAYMENT RECORD FIX (Finalized to use _id) ⭐️
    const handleRecordPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!selectedInvoice || parseFloat(paymentAmount) <= 0 || isPaymentLoading) return;
        
        // ⚠️ BACKEND NOTE: The 'Order not found' error is because selectedInvoice._id is empty.
        // You MUST fix your data fetching logic (e.g., getOrders in src/lib/data.ts)
        // to map the database's document ID to the _id property.

        setIsPaymentLoading(true);
        const amount = parseFloat(paymentAmount);

        try {
            const newPayment = await addPaymentToOrder(
                selectedInvoice.customerId,
                selectedInvoice._id, // Using _id, which MUST contain the cryptic database key
                {
                    amount: amount,
                    mode: paymentMethod,
                    date: paymentDate,
					notes: paymentNotes, 
                    recordedBy: 'User'
                }
            );

            const customer = customers.find(c => c.id === selectedInvoice.customerId);

            toast({ title: "Payment Recorded", description: `Recorded ${formatCurrency(amount)} via ${paymentMethod}.` });
            
            await refreshOrders();

            if (customer && newPayment) {
                const updatedInvoice = allInvoices.find(o => o._id === selectedInvoice._id);
                if(updatedInvoice) {
                    setReceiptToPrint({
                        order: updatedInvoice,
                        payment: newPayment,
                        historicalPayments: updatedInvoice.payments?.filter(p => p.id !== newPayment.id) || [],
                    });
                }
            }

            setPaymentAmount(''); // Clear form
			setPaymentNotes(''); 
        } catch (error) {
            toast({ title: "Payment Failed", description: "Failed to record payment. See console for details.", variant: "destructive" });
            console.error("Error recording payment:", error);
        } finally {
            setIsPaymentLoading(false);
        }
    };


    const handleDeletePayment = async (paymentId: string) => {
        if (!selectedInvoice) return;

        try {
            await deletePaymentFromOrder(selectedInvoice._id, paymentId);
            toast({ title: "Payment Deleted", description: `Payment ${paymentId} has been successfully removed.` });
            await refreshOrders();
        } catch (error) {
            toast({ title: "Deletion Failed", description: "Failed to delete payment. See console for details.", variant: "destructive" });
            console.error("Error deleting payment:", error);
        }
    };


    // --------------------------------------------------------------------------------
    // --- COMPONENT RENDER ---
    // --------------------------------------------------------------------------------

    return (
        <div className="p-4 space-y-4">
            <h1 className="text-3xl font-bold">Invoices</h1>
            
            <div className="flex justify-between items-center">
                <Input
                    placeholder="Search by Invoice ID or Customer Name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                />
                <Button onClick={() => console.log("Navigate to New Invoice form")}>
                    + New Invoice
                </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {/* Table Headers with Sorting */}
                            <TableHead className="w-[100px] cursor-pointer" onClick={() => requestSort('id')}>Invoice ID{getSortIndicator('id')}</TableHead>
                            <TableHead className="cursor-pointer" onClick={() => requestSort('customerName')}>Customer{getSortIndicator('customerName')}</TableHead>
                            <TableHead className="cursor-pointer text-right" onClick={() => requestSort('grandTotal')}>Total{getSortIndicator('grandTotal')}</TableHead>
                            <TableHead className="cursor-pointer text-right" onClick={() => requestSort('balanceDue')}>Balance Due{getSortIndicator('balanceDue')}</TableHead>
                            <TableHead className="cursor-pointer w-[150px]" onClick={() => requestSort('status')}>Status{getSortIndicator('status')}</TableHead>
                            <TableHead className="text-right w-[50px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredInvoices.length > 0 ? (
                            filteredInvoices.map((invoice) => (
                                <TableRow key={invoice.id} onClick={() => { setSelectedInvoice(invoice); setIsSheetOpen(true); }} className="cursor-pointer hover:bg-muted/50">
                                    <TableCell className="font-medium">{invoice.id}</TableCell>
                                    <TableCell>{invoice.customerName}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(invoice.grandTotal)}</TableCell>
                                    <TableCell className={`text-right font-semibold ${invoice.balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {formatCurrency(invoice.balanceDue)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={invoice.status === 'Paid' ? 'default' : invoice.status === 'Partially Paid' ? 'secondary' : 'outline'}>
                                            {invoice.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedInvoice(invoice); setIsSheetOpen(true); setTabValue('payment'); }}>
                                            <Receipt className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    No invoices found matching your criteria.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Invoice Detail Sheet */}
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetContent className="w-full sm:max-w-xl">
                    <SheetHeader>
                        <SheetTitle>{selectedInvoice ? `Invoice ${selectedInvoice.id}` : 'Invoice Details'}</SheetTitle>
                        <SheetDescription>
                            Review details and record payments for this invoice.
                        </SheetDescription>
                    </SheetHeader>
                    
                    {selectedInvoice && (
                        <div className="h-full pt-4 flex flex-col">
                            <Tabs value={tabValue} onValueChange={setTabValue} className="w-full">
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="details">Details</TabsTrigger>
                                    <TabsTrigger value="payment">Payment</TabsTrigger>
                                    <TabsTrigger value="history">History</TabsTrigger>
                                </TabsList>
                                
                                {/* ----------------------- TAB: DETAILS ----------------------- */}
                                <TabsContent value="details" className="mt-4 space-y-4">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Invoice Summary</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-2 text-sm">
                                            <p><strong>Customer:</strong> {selectedInvoice.customerName}</p>
                                            <p><strong>Total:</strong> {formatCurrency(selectedInvoice.grandTotal)}</p>
                                            <p><strong>Balance Due:</strong> <span className={`font-semibold ${selectedInvoice.balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(selectedInvoice.balanceDue)}</span></p>
                                            <p><strong>Date:</strong> {formatDate(selectedInvoice.orderDate)}</p>
                                            <p><strong>Due:</strong> {selectedInvoice.dueDate ? formatDate(selectedInvoice.dueDate) : 'N/A'}</p>
                                        </CardContent>
                                        <CardFooter className="flex justify-between">
                                            <Button variant="outline" className="flex items-center gap-2">
                                                <Edit className="h-4 w-4" /> Edit Invoice
                                            </Button>
                                            <Button variant="secondary" className="flex items-center gap-2">
                                                <Share2 className="h-4 w-4" /> Share
                                            </Button>
                                        </CardFooter>
                                    </Card>

                                    {/* Line Items Table (Placeholder - needs full implementation) */}
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Line Items</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Item</TableHead>
                                                        <TableHead className="text-right">Qty</TableHead>
                                                        <TableHead className="text-right">Price</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {selectedInvoice.items.length > 0 ? (
                                                        selectedInvoice.items.map((item, index) => (
                                                            <TableRow key={index}>
                                                                <TableCell>{item.name}</TableCell>
                                                                <TableCell className="text-right">{item.quantity}</TableCell>
                                                                <TableCell className="text-right">{formatCurrency(item.price)}</TableCell>
                                                            </TableRow>
                                                        ))
                                                    ) : (
                                                        <TableRow><TableCell colSpan={3} className="text-center">No items listed.</TableCell></TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>
                                </TabsContent>


                                {/* ----------------------- TAB: PAYMENT ----------------------- */}
                                <TabsContent value="payment" className="mt-4 space-y-4">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Record New Payment</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <form onSubmit={handleRecordPayment} className="space-y-4">
                                                {/* 1. Amount to Pay */}
                                                <div className="space-y-2">
                                                    <Label htmlFor="paymentAmount">Amount to Pay</Label>
                                                    <Input
                                                        id="paymentAmount"
                                                        type="number"
                                                        step="0.01"
                                                        max={selectedInvoice.balanceDue}
                                                        value={paymentAmount}
                                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                                        required
                                                    />
                                                </div>

                                                {/* 2. Payment Date and Payment Method (Grid - Fixes Issue 1 layout) */}
                                                <div className="grid grid-cols-2 gap-4">
                                                    {/* Payment Date Input */}
                                                    <div className="space-y-2">
                                                        <Label htmlFor="paymentDate">Payment Date</Label>
                                                        <Input
                                                            id="paymentDate"
                                                            type="date"
                                                            value={paymentDate}
                                                            onChange={(e) => setPaymentDate(e.target.value)}
                                                            required
                                                        />
                                                    </div>
                                                    
                                                    {/* Payment Method Select (now includes UPI) */}
                                                    <div className="space-y-2">
                                                        <Label htmlFor="paymentMethod">Payment Method</Label>
                                                        <Select value={paymentMethod} onValueChange={v => setPaymentMode(v as PaymentMode)}>
                                                            {/* ⭐️ FIX: Added id="paymentMethod" to link to the Label and resolve warnings ⭐️ */}
                                                            <SelectTrigger id="paymentMethod"><SelectValue /></SelectTrigger> 
                                                            <SelectContent>
                                                                <SelectItem value="Cash">Cash</SelectItem>
                                                                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                                                                <SelectItem value="UPI">UPI</SelectItem>
                                                                <SelectItem value="Credit Card">Credit Card</SelectItem>
                                                                <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>

                                                {/* 3. Notes (Optional - Fixes Issue 1) */}
                                                <div className="space-y-2">
                                                    <Label htmlFor="paymentNotes">Notes (Optional)</Label>
                                                    <Input
                                                        id="paymentNotes"
                                                        value={paymentNotes}
                                                        onChange={(e) => setPaymentNotes(e.target.value)}
                                                        placeholder="e.g. Cheque No. 12345"
                                                    />
                                                </div>

                                                <Button type="submit" className="w-full" disabled={isPaymentLoading || parseFloat(paymentAmount) <= 0 || (selectedInvoice.balanceDue ?? 0) <= 0}>
                                                    {isPaymentLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                    Record Payment
                                                </Button>
                                            </form>
                                        </CardContent>
                                    </Card>
                                </TabsContent>


                                {/* ----------------------- TAB: HISTORY ----------------------- */}
                                <TabsContent value="history" className="mt-4 space-y-4">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Payment History</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Date</TableHead>
                                                        <TableHead>Amount</TableHead>
                                                        <TableHead>Method</TableHead>
                                                        <TableHead className="text-right">Actions</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {selectedInvoice.payments?.length > 0 ? (
                                                        selectedInvoice.payments.map((payment) => (
                                                            <TableRow key={payment.id}>
                                                                <TableCell>{formatDate(payment.date)}</TableCell>
                                                                <TableCell className="font-medium">{formatCurrency(payment.amount)}</TableCell>
                                                                <TableCell>{payment.mode}</TableCell>
                                                                <TableCell className="text-right">
                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger asChild>
                                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                                <span className="sr-only">Open menu</span>
                                                                                <MoreHorizontal className="h-4 w-4" />
                                                                            </Button>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="end">
                                                                            <DropdownMenuItem onClick={() => console.log('View receipt for', payment.id)}>View Receipt</DropdownMenuItem>
                                                                            <DropdownMenuSeparator />
                                                                            <AlertDialog>
                                                                                <AlertDialogTrigger asChild>
                                                                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600">
                                                                                        <Trash2 className="mr-2 h-4 w-4" /> Delete Payment
                                                                                    </DropdownMenuItem>
                                                                                </AlertDialogTrigger>
                                                                                <AlertDialogContent>
                                                                                    <AlertDialogHeader>
                                                                                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                                                        <AlertDialogDescription>
                                                                                            This action cannot be undone. This will permanently remove the payment record and adjust the invoice balance.
                                                                                        </AlertDialogDescription>
                                                                                    </AlertDialogHeader>
                                                                                    <AlertDialogFooter>
                                                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                                        <AlertDialogAction 
                                                                                            onClick={() => handleDeletePayment(payment.id)} 
                                                                                            className="bg-red-600 hover:bg-red-700"
                                                                                        >
                                                                                            Confirm Delete
                                                                                        </AlertDialogAction>
                                                                                    </AlertDialogFooter>
                                                                                </AlertDialogContent>
                                                                            </AlertDialog>
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))
                                                    ) : (
                                                        <TableRow><TableCell colSpan={4} className="text-center">No payments recorded yet.</TableCell></TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                            </Tabs>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            {/* Receipt Print Modal (Assuming the logic is complex and remains as is) */}
            {receiptToPrint && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
                    <Card className="w-full max-w-xl mx-4">
                        <CardHeader className="flex flex-row justify-between items-center">
                            <CardTitle>Print Receipt</CardTitle>
                            <Button onClick={() => setReceiptToPrint(null)} variant="ghost">Close</Button>
                        </CardHeader>
                        <CardContent>
                            <ReceiptTemplate 
                                receiptRef={receiptRef} 
                                order={receiptToPrint.order} 
                                payment={receiptToPrint.payment} 
                                historicalPayments={receiptToPrint.historicalPayments} 
                                customer={customers.find(c => c.id === receiptToPrint.order.customerId)}
                                logoUrl={logoUrl}
                            />
                        </CardContent>
                        <CardFooter>
                             <Button onClick={() => setReceiptToPrint(null)} className="w-full">
                                Done Printing
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
        </div>
    );
}