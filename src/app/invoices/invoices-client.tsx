'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { Order, Payment, PaymentMode, Customer, SortKey } from '@/lib/types';
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
import { Loader2, Receipt, Trash2, Share2, ArrowUpDown, MoreHorizontal, X, Edit } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
// ASSUMED DATA FUNCTIONS - Ensure these paths are correct
import { getCustomers, getOrders, recordPayment, deleteInvoice as deleteInvoiceFromDB, deletePaymentFromOrder } from '@/lib/data';
import ReceiptTemplate from '@/components/receipt-template';
import { DropdownMenuSeparator } from '@radix-ui/react-dropdown-menu';


// --- HELPER FUNCTION PLACEHOLDERS ---
const formatNumber = (num: number | null | undefined): string => 
    (num ?? 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
const getCustomerName = (customerId: string, customers: Customer[]): string =>
    customers.find(c => c.id === customerId)?.name || 'Unknown Customer';

const logoUrl = '/logo.png'; // ASSUMED logo URL

// --- INVOICES CLIENT COMPONENT ---
export default function InvoicesClient() {
    // --- STATE MANAGEMENT ---
    const [allInvoices, setAllInvoices] = useState<Order[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isMounted, setIsMounted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedInvoice, setSelectedInvoice] = useState<Order | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMode>('Cash');
    const [isPaymentLoading, setIsPaymentLoading] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
    const [invoiceToDelete, setInvoiceToDelete] = useState<Order | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [receiptToPrint, setReceiptToPrint] = useState<{ order: Order, payment: Payment, historicalPayments: Payment[], customer?: Customer } | null>(null);
    const [isReceiptLoading, setIsReceiptLoading] = useState(false);

    const receiptRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();
    
    // --- CRITICAL useEffect: DATA FETCHING ---
    useEffect(() => {
        setIsMounted(true);
        async function loadData() {
            try {
                const [orders, customersData] = await Promise.all([
                    getOrders(),
                    getCustomers()
                ]);
                setAllInvoices(orders);
                setCustomers(customersData);
            } catch (error) {
                console.error("Failed to fetch data:", error);
                toast({
                    title: "Error",
                    description: "Failed to load invoices or customer data.",
                    variant: "destructive",
                });
            } finally {
                setIsLoading(false);
            }
        }
        loadData();
    }, [toast]); // <--- CRITICAL: Correctly closed useEffect

    // --- MEMOIZED DATA FOR FILTERING AND SORTING ---
    const sortedInvoices = useMemo(() => {
        let sortableItems = [...allInvoices];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                let aVal: any = a[sortConfig.key as keyof Order] ?? '';
                let bVal: any = b[sortConfig.key as keyof Order] ?? '';

                if (sortConfig.key === 'date') {
                    aVal = new Date(aVal).getTime();
                    bVal = new Date(bVal).getTime();
                }

                if (aVal < bVal) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aVal > bVal) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [allInvoices, sortConfig]);

    const filteredInvoices = useMemo(() => {
        if (!searchQuery) return sortedInvoices;
        const query = searchQuery.toLowerCase();
        return sortedInvoices.filter(invoice => {
            const customerName = getCustomerName(invoice.customerId, customers).toLowerCase();
            return (
                invoice.id.toLowerCase().includes(query) ||
                customerName.includes(query) ||
                (invoice.status?.toLowerCase().includes(query))
            );
        });
    }, [sortedInvoices, searchQuery, customers]);

    // --- HANDLER FUNCTIONS ---
    const requestSort = (key: SortKey) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const handleRecordPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedInvoice || isPaymentLoading) return;

        const amount = parseFloat(paymentAmount);
        if (isNaN(amount) || amount <= 0 || amount > (selectedInvoice.balanceDue ?? 0)) {
            toast({
                title: "Invalid Amount",
                description: "Please enter a valid amount less than or equal to the balance due.",
                variant: "destructive",
            });
            return;
        }

        setIsPaymentLoading(true);
        try {
            const newPayment = await recordPayment(selectedInvoice.customerId, selectedInvoice.id, amount, paymentMethod);
            
            // Update local state for immediate feedback
            const updatedInvoice = {
                ...selectedInvoice,
                payments: [...selectedInvoice.payments, newPayment],
                balanceDue: (selectedInvoice.balanceDue ?? 0) - amount,
                status: ((selectedInvoice.balanceDue ?? 0) - amount <= 0) ? 'Fulfilled' : selectedInvoice.status,
            };

            setAllInvoices(prev => prev.map(i => i.id === selectedInvoice.id ? updatedInvoice : i));
            setSelectedInvoice(updatedInvoice); // Update the currently open invoice
            setPaymentAmount('');

            toast({
                title: "Payment Recorded",
                description: `Successfully recorded ${formatNumber(amount)} via ${paymentMethod}.`,
            });
        } catch (error) {
            console.error("Payment recording failed:", error);
            toast({
                title: "Error",
                description: "Failed to record payment. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsPaymentLoading(false);
        }
    };

    const handleSetReceiptData = (payment: Payment) => {
        if (!selectedInvoice) return;
        setReceiptToPrint({
            order: selectedInvoice,
            payment: payment,
            historicalPayments: selectedInvoice.payments.filter(p => new Date(p.date) <= new Date(payment.date)),
            customer: customers.find(c => c.id === selectedInvoice.customerId),
        });
    };

    const handleWhatsAppShare = (payment: Payment) => {
        if (!selectedInvoice) return;
        
        const customer = customers.find(c => c.id === selectedInvoice.customerId);
        const customerName = customer ? customer.name : 'Customer';
        const customerPhone = customer ? customer.phone : '';

        const receiptMessage = `*Invoice Payment Receipt*\n\n` +
                               `*Invoice ID:* ${selectedInvoice.id.replace('ORD', 'INV')}\n` +
                               `*Customer:* ${customerName}\n` +
                               `*Payment Amount:* ${formatNumber(payment.amount)}\n` +
                               `*Payment Date:* ${new Date(payment.date).toLocaleDateString('en-IN')}\n` +
                               `*Method:* ${payment.mode}\n` +
                               `*Current Balance Due:* ${formatNumber((selectedInvoice.balanceDue ?? 0))}\n\n` +
                               `Thank you for your business!`;
        
        const encodedMessage = encodeURIComponent(receiptMessage);
        const whatsappUrl = `https://wa.me/${customerPhone}?text=${encodedMessage}`;

        window.open(whatsappUrl, '_blank');
        toast({
            title: "WhatsApp Share",
            description: "Opening WhatsApp with the receipt message...",
        });
    };

    const handlePrintAction = useCallback(() => {
        if (receiptRef.current) {
            setIsReceiptLoading(true);
            try {
                const printableContent = receiptRef.current.querySelector('#printable-receipt');
                if (printableContent) {
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                        printWindow.document.write('<html><head><title>Print Receipt</title>');
                        printWindow.document.write('</head><body>');
                        printWindow.document.write(printableContent.innerHTML);
                        printWindow.document.write('</body></html>');
                        printWindow.document.close();
                        printWindow.focus();
                        printWindow.print();
                        printWindow.close();
                    } else {
                        throw new Error("Failed to open print window.");
                    }
                }
                toast({ title: "Print Successful", description: "Receipt sent to printer." });
            } catch (error) {
                console.error("Print failed:", error);
                toast({ title: "Print Error", description: "Failed to initiate printing.", variant: "destructive" });
            } finally {
                setIsReceiptLoading(false);
                setReceiptToPrint(null); // Close the modal after printing
            }
        }
    }, [toast]);
    
    // --- PAYMENT DELETE HANDLER (NEW FEATURE) ---
    const handleDeletePayment = async (customerId: string, orderId: string, paymentId: string) => {
        setIsDeleting(true);
        try {
            await deletePaymentFromOrder(customerId, orderId, paymentId);
            
            // Re-fetch all orders to ensure balances are fully recalculated in state
            const updatedOrders = await getOrders();
            setAllInvoices(updatedOrders);
            
            // Find the updated version of the current invoice
            const updatedSelectedInvoice = updatedOrders.find(i => i.id === selectedInvoice?.id);
            if (updatedSelectedInvoice) {
                setSelectedInvoice(updatedSelectedInvoice);
            } else {
                 setSelectedInvoice(null);
            }

            toast({
                title: "Payment Deleted",
                description: `Payment record ${paymentId.substring(0, 8)}... has been successfully removed. Balances are updated.`,
            });
        } catch (error) {
            console.error("Error deleting payment:", error);
            toast({
                title: "Error",
                description: "Failed to delete payment. Check console for details.",
                variant: "destructive",
            });
        } finally {
            setIsDeleting(false);
        }
    };
    
    // --- INVOICE DELETE HANDLERS ---
    const handleDeleteInvoice = async () => {
        if (!invoiceToDelete) return;

        try {
            await deleteInvoiceFromDB(invoiceToDelete.customerId, invoiceToDelete.id);

            // Update local state
            setAllInvoices(prev => prev.filter(i => i.id !== invoiceToDelete.id));
            setInvoiceToDelete(null);
            setSelectedInvoice(null);

            toast({
                title: "Invoice Deleted",
                description: `Invoice ${invoiceToDelete.id.replace('ORD', 'INV')} has been permanently deleted.`,
            });

        } catch (error) {
            console.error("Error deleting invoice:", error);
            toast({
                title: "Error",
                description: "Failed to delete the invoice. Please try again.",
                variant: "destructive",
            });
        }
    };

    const handleRowClick = (invoice: Order) => {
        const freshInvoice = allInvoices.find(i => i.id === invoice.id) || invoice;
        setSelectedInvoice(freshInvoice);
    };

    const handleInvoiceDeleteClick = (invoice: Order) => {
        setInvoiceToDelete(invoice);
    };


    // --- CRITICAL FIX: Ensure all logic blocks are closed before this check ---
    if (isLoading || !isMounted) {
        // Skeleton loading state
        return (
            <div className="p-4 space-y-4">
                <Skeleton className="h-10 w-full" />
                <div className="rounded-lg border shadow-sm">
                    <Table>
                        <TableHeader><TableRow>{Array(9).fill(0).map((_, i) => <TableHead key={i}><Skeleton className="h-6 w-24" /></TableHead>)}</TableRow></TableHeader>
                        <TableBody>{Array(10).fill(0).map((_, i) => <TableRow key={i}>{Array(9).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>)}</TableBody>
                    </Table>
                </div>
            </div>
        );
    } 

    // --- COMPONENT RETURN ---
    return (
        <div className="p-4">
            <h1 className="text-3xl font-bold mb-6">Invoices Management</h1>
            <div className="flex justify-between items-center mb-4">
                <Input 
                    placeholder="Search invoices by ID, customer, or status..." 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="max-w-sm"
                />
            </div>

            <Tabs defaultValue="all" className="w-full">
                <TabsList className="grid w-full grid-cols-3 md:w-fit">
                    <TabsTrigger value="all">All Invoices ({allInvoices.length})</TabsTrigger>
                    <TabsTrigger value="due">Balance Due ({allInvoices.filter(i => (i.balanceDue ?? 0) > 0).length})</TabsTrigger>
                    <TabsTrigger value="fulfilled">Fulfilled ({allInvoices.filter(i => i.status === 'Fulfilled').length})</TabsTrigger>
                </TabsList>
                <TabsContent value="all" className="mt-4">
                    <InvoiceTable 
                        invoices={filteredInvoices} 
                        onRowClick={handleRowClick}
                        onDeleteClick={handleInvoiceDeleteClick}
                        sortConfig={sortConfig}
                        requestSort={requestSort}
                        customers={customers}
                    />
                </TabsContent>
                <TabsContent value="due" className="mt-4">
                    <InvoiceTable 
                         invoices={filteredInvoices.filter(i => (i.balanceDue ?? 0) > 0)}
                         onRowClick={handleRowClick}
                         onDeleteClick={handleInvoiceDeleteClick}
                         sortConfig={sortConfig}
                         requestSort={requestSort}
                         customers={customers}
                    />
                </TabsContent>
                <TabsContent value="fulfilled" className="mt-4">
                    <InvoiceTable 
                        invoices={filteredInvoices.filter(i => i.status === 'Fulfilled')}
                        onRowClick={handleRowClick}
                        onDeleteClick={handleInvoiceDeleteClick}
                        sortConfig={sortConfig}
                        requestSort={requestSort}
                        customers={customers}
                    />
                </TabsContent>
            </Tabs>

            {/* Invoice Detail Sheet/Drawer */}
            <Sheet open={!!selectedInvoice} onOpenChange={(open) => {
                 if (!open) {
                    setSelectedInvoice(null);
                    setPaymentAmount('');
                 }
            }}>
                <SheetContent side="right" className="sm:max-w-xl flex flex-col">
                    <SheetHeader>
                        <SheetTitle>Invoice # {selectedInvoice?.id.replace('ORD', 'INV')}</SheetTitle>
                        <SheetDescription>
                            Customer: {selectedInvoice && getCustomerName(selectedInvoice.customerId, customers)}
                        </SheetDescription>
                    </SheetHeader>
                    
                    {selectedInvoice && (
                        <div className="flex-grow overflow-y-auto p-4">
                            {/* --- ORDER SUMMARY CARDS --- */}
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <Card>
                                    <CardHeader className="p-3">
                                        <CardTitle className="text-sm font-medium">Grand Total</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0">
                                        <div className="text-xl font-bold">{formatNumber(selectedInvoice.grandTotal)}</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="p-3">
                                        <CardTitle className="text-sm font-medium">Balance Due</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0">
                                        <div className={cn("text-xl font-bold", (selectedInvoice.balanceDue ?? 0) > 0 && "text-destructive")}>
                                            {formatNumber(selectedInvoice.balanceDue)}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                            
                            {/* --- RECORD PAYMENT FORM --- */}
                            <Card className="mb-4">
                                <CardHeader>
                                    <CardTitle>Record New Payment</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <form onSubmit={handleRecordPayment} className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="paymentAmount">Amount to Pay (Max: {formatNumber(selectedInvoice.balanceDue)})</Label>
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
                                         <div className="space-y-2">
                                            <Label htmlFor="paymentMethod">Payment Method</Label>
                                            <Select value={paymentMethod} onValueChange={v => setPaymentMethod(v as PaymentMode)}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Cash">Cash</SelectItem>
                                                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                                                    <SelectItem value="Credit Card">Credit Card</SelectItem>
                                                    <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button type="submit" className="w-full" disabled={isPaymentLoading || parseFloat(paymentAmount) <= 0 || (selectedInvoice.balanceDue ?? 0) <= 0}>
                                            {isPaymentLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            Record Payment
                                        </Button>
                                    </form>
                                </CardContent>
                            </Card>

                            <Separator className="my-4" />
                            <h3 className="text-lg font-semibold mb-2">Payment Records</h3>

                            {/* --- MODIFIED PAYMENT RECORDS LIST with DELETE BUTTON --- */}
                            {selectedInvoice.payments.length === 0 ? (
								<p className="text-sm text-gray-500">No payment records found for this invoice.</p>
							) : (
							<div className="space-y-2">
								{/* Sort payments by date descending for history view */}
								{selectedInvoice.payments.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((payment) => (
									<div key={payment.id} className="flex justify-between items-center p-3 border rounded-md">
										<div className="flex flex-col w-3/4">
											<span className="font-medium">Amount: {formatNumber(payment.amount)}</span>
											<span className="text-sm text-gray-600">
												{new Date(payment.date).toLocaleDateString('en-IN')} via {payment.mode}
											</span>
										</div>
                
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
											{/* This is the single visible three-dot button */}
												<Button variant="ghost" className="h-8 w-8 p-0">
													<span className="sr-only">Open actions menu</span>
													<MoreHorizontal className="h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
        
												{/* 1. Download Receipt Action */}
												<DropdownMenuItem onClick={() => handleSetReceiptData(payment)} disabled={isReceiptLoading}>
													<Receipt className="mr-2 h-4 w-4" />
													Download Receipt
												</DropdownMenuItem>

												{/* 2. Share Receipt Action */}
												<DropdownMenuItem onClick={() => handleWhatsAppShare(payment)}>
													<Share2 className="mr-2 h-4 w-4" />
													Share Receipt
												</DropdownMenuItem>

												{/* 3. Delete Payment Action (Wrapped in AlertDialog) */}
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<DropdownMenuItem 
						// Prevents the dropdown from closing when clicking the trigger
						onSelect={(e) => e.preventDefault()}
						className="text-red-600 focus:text-red-600 cursor-pointer"
					>
						<Trash2 className="mr-2 h-4 w-4" />
						Delete Payment
					</DropdownMenuItem>
				</AlertDialogTrigger>
            
            {/* ALERT DIALOG CONTENT */}
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Payment Deletion</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to delete this payment of <span className="font-bold">{formatNumber(payment.amount)}</span>? This action is permanent and will affect the invoice balance and customer running balance.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                        onClick={() => handleDeletePayment(
                            selectedInvoice.customerId,
                            selectedInvoice.id,
                            payment.id
                        )}
                        disabled={isDeleting}
                        className="bg-destructive hover:bg-red-700"
                    >
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Delete Record
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </DropdownMenuContent>
</DropdownMenu>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>Confirm Payment Deletion</AlertDialogTitle>
														<AlertDialogDescription>
															Are you sure you want to delete this payment of <span className="font-bold">{formatNumber(payment.amount)}</span>? This action is permanent and will affect the invoice balance and customer running balance.
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel>Cancel</AlertDialogCancel>
														<AlertDialogAction 
															onClick={() => handleDeletePayment(
																selectedInvoice.customerId,
																selectedInvoice.id,
																payment.id
															)} 
															disabled={isDeleting}
															className="bg-destructive hover:bg-red-700"
														>
															{isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
															Delete Record
														</AlertDialogAction>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
										</div>
									</div>
								))}
							</div>
						)}
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            {/* Invoice Delete Confirmation Dialog */}
            <AlertDialog open={!!invoiceToDelete} onOpenChange={(open) => !open && setInvoiceToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete invoice <span className="font-bold">{invoiceToDelete?.id.replace('ORD', 'INV')}</span> and recalculate all subsequent customer balances.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteInvoice} className="bg-destructive hover:bg-red-700">
                            Delete Invoice
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
            {/* Receipt Print Modal (With integrated printing button) */}
            {receiptToPrint && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
                    <Card className="w-full max-w-xl mx-4">
                        <CardHeader className="flex flex-row justify-between items-center">
                            <CardTitle>Print Receipt</CardTitle>
                            <Button onClick={() => setReceiptToPrint(null)} variant="ghost">
                                <X className="h-4 w-4 mr-2" /> Close Preview
                            </Button>
                        </CardHeader>
                        <CardContent className="max-h-[70vh] overflow-y-auto">
                            <div ref={receiptRef} className="bg-white p-2 border shadow-lg mx-auto w-full max-w-sm">
                                <div id="printable-receipt">
                                    <ReceiptTemplate 
                                        order={receiptToPrint.order} 
                                        payment={receiptToPrint.payment} 
                                        historicalPayments={receiptToPrint.historicalPayments} 
                                        customer={customers.find(c => c.id === receiptToPrint.order.customerId)}
                                        logoUrl={logoUrl}
                                    />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-end p-4 border-t">
                             <Button onClick={handlePrintAction} disabled={isReceiptLoading} className="w-full">
                                {isReceiptLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
                                Generate PDF and Print
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
        </div>
    );
}


// --- ASSUMED INVOICETABLE COMPONENT ---
// This is a placeholder structure for the InvoiceTable component used above.
const InvoiceTable: React.FC<any> = ({ invoices, onRowClick, onDeleteClick, sortConfig, requestSort, customers }) => {
    return (
        <div className="rounded-lg border shadow-sm overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {invoices.map((invoice: Order) => (
                        <TableRow key={invoice.id} onClick={() => onRowClick(invoice)} className="cursor-pointer hover:bg-gray-50">
                            <TableCell>{invoice.id.replace('ORD', 'INV')}</TableCell>
                            <TableCell>{getCustomerName(invoice.customerId, customers)}</TableCell>
                            <TableCell>{new Date(invoice.date).toLocaleDateString()}</TableCell>
                            <TableCell>{formatNumber(invoice.grandTotal)}</TableCell>
                            <TableCell><Badge variant={ (invoice.balanceDue ?? 0) > 0 ? 'destructive' : 'secondary'}>{formatNumber(invoice.balanceDue)}</Badge></TableCell>
                            <TableCell>{invoice.status}</TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                            <span className="sr-only">Open menu</span>
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => onRowClick(invoice)}>
                                            <Edit className="mr-2 h-4 w-4" /> View/Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => onDeleteClick(invoice)} className="text-red-600">
                                            <Trash2 className="mr-2 h-4 w-4" /> Delete Invoice
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
};