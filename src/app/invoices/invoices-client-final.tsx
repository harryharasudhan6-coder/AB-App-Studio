'use client';
import React, { useState, useMemo, useRef, useEffect } from 'react';
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
import { Loader2, Receipt, Trash2, Share2, ArrowUpDown, MoreHorizontal, Edit, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { getInvoices, addPaymentToOrder, deletePaymentFromOrder, getCustomers, updateOrder, permanentlyDeleteOrder } from '@/lib/data';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Edit2, Download } from 'lucide-react';
import { MessageCircle } from 'lucide-react';
import html2canvas from 'html2canvas';

// Utility Functions
const formatNumber = (num: number) => num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatCurrency = (num: number) => `₹ ${formatNumber(num)}`;
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

// Receipt Template
// Receipt Template
const ReceiptTemplate = ({ receiptRef, order, payment, historicalPayments, customer, logoUrl }: any) => {
  const totalPaid = historicalPayments.reduce((sum: number, p: any) => sum + p.amount, 0);

  return (
    <div ref={receiptRef} className="p-8 bg-white text-slate-900 font-sans max-w-[800px] mx-auto" id="receipt-template">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div className="flex flex-col items-start">
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-24 object-contain" />}
        </div>
        <div className="text-right">
          <h1 className="text-4xl font-bold text-slate-700 tracking-wide">RECEIPT</h1>
          <p className="text-sm font-semibold mt-1">Receipt #: RCPT-{order.id.replace('ORD', 'INV')}</p>
          <p className="text-sm font-semibold">Payment Date: {formatDate(payment.date)}</p>
        </div>
      </div>

      {/* Company Info */}
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold mb-1">AB Agency</h2>
        <p className="text-sm text-slate-600 leading-tight">No.1, Ayyanchery main road, Ayyanchery, Urapakkam</p>
        <p className="text-sm text-slate-600 leading-tight">Chennai - 603210</p>
        <p className="text-sm text-slate-600 leading-tight mt-1">MOB: 95511 95505 / 95001 82975</p>
      </div>

      {/* Bill To & Payment Details */}
      <div className="flex justify-between mb-12 gap-8">
        <div className="flex-1">
          <h3 className="text-slate-500 font-semibold mb-2">Billed To:</h3>
          <p className="font-bold text-lg">{customer?.name || 'Customer Name'}</p>
          <p className="text-sm text-slate-600 whitespace-pre-line">{order.deliveryAddress || customer?.address || 'Address not provided'}</p>
        </div>
        <div className="flex-1 text-right">
          <h3 className="text-slate-500 font-semibold mb-2">Payment Details:</h3>
          <p className="text-sm"><span className="text-slate-600">Invoice #:</span> <span className="font-semibold">{order.id.replace('ORD', 'INV')}</span></p>
          <p className="text-sm"><span className="text-slate-600">Payment Method:</span> <span className="font-semibold">{payment.mode}</span></p>
          <p className="text-xs text-slate-500 mt-2 max-w-[280px] ml-auto leading-tight">
            Notes: PAYMENT OF {formatCurrency(payment.amount)} FOR A PENDING OUTSTANDING AMOUNT OF {formatCurrency((order.balanceDue || 0) + payment.amount)}
          </p>
        </div>
      </div>

      {/* Amount Paid */}
      <div className="text-center mb-12">
        <h3 className="text-slate-500 mb-2">Amount Paid this Transaction</h3>
        <p className="text-5xl font-bold text-slate-900">{formatCurrency(payment.amount)}</p>
      </div>

      {/* Summary */}
      <div className="border-t border-b border-slate-200 py-4 mb-8">
        <div className="flex justify-between mb-2">
          <span className="text-slate-600">Original Invoice Total</span>
          <span className="font-semibold">{formatCurrency(order.grandTotal)}</span>
        </div>
        <div className="flex justify-between bg-slate-50 p-2 rounded">
          <span className="font-bold text-slate-900">Balance Due</span>
          <span className={`font-bold ${(order.balanceDue ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
			{formatCurrency(order.balanceDue ?? 0)}
          </span>
        </div>
      </div>

      {/* Payment History */}
      <div>
        <h3 className="font-bold mb-4 text-sm uppercase tracking-wider text-slate-700">Payment History for this Invoice:</h3>
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2 font-semibold text-slate-600">Date</th>
              <th className="text-right p-2 font-semibold text-slate-600">Amount Paid</th>
            </tr>
          </thead>
          <tbody>
            {historicalPayments.map((p: any, i: number) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="p-2">{formatDate(p.date)}</td>
                <td className="p-2 text-right">{formatCurrency(p.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className="p-2 text-right pt-4">Total Paid:</td>
              <td className="p-2 text-right pt-4">{formatCurrency(totalPaid)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

// Hook: useInvoiceData
const useInvoiceData = (initialOrders: Order[] = [], initialCustomers: Customer[] = []) => {
  const [allInvoices, setAllInvoices] = useState<Order[]>(initialOrders);
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [loading, setLoading] = useState(!initialOrders.length);

  const refreshOrders = async () => {
    try {
      setLoading(true);
      const [invoices, customersData] = await Promise.all([
        getInvoices(),
        getCustomers()
      ]);
      setAllInvoices(invoices);
      setCustomers(customersData);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialOrders.length === 0) {
      refreshOrders();
    }
  }, []);

  return { allInvoices, customers, refreshOrders, loading };
};

// REUSABLE INVOICE TABLE
const InvoiceTable = ({
  invoices,
  searchTerm,
  sortConfig,
  requestSort,
  getSortIndicator,
  setSelectedInvoice,
  setIsSheetOpen,
  setTabValue,
  handleRestoreOrder,
  handleDownloadInvoice,
  handlePermanentDelete,
}: {
  invoices: Order[];
  searchTerm: string;
  sortConfig: any;
  requestSort: (key: SortKey) => void;
  getSortIndicator: (key: SortKey) => React.ReactNode;
  setSelectedInvoice: (invoice: Order) => void;
  setIsSheetOpen: (open: boolean) => void;
  setTabValue: (value: string) => void;
  handleRestoreOrder: (order: Order) => void;
  handleDownloadInvoice: (order: Order) => void;
  handlePermanentDelete: (order: Order) => void;
}) => {
  const filtered = useMemo(() => {
    let result = invoices.filter(invoice =>
      invoice.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue = (a as any)[sortConfig.key!];
        let bValue = (b as any)[sortConfig.key!];
        if (sortConfig.key === 'id') {
          aValue = parseInt(a.id.replace(/[^0-9]/g, '')) || 0;
          bValue = parseInt(b.id.replace(/[^0-9]/g, '')) || 0;
        }
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
    return result;
  }, [invoices, searchTerm, sortConfig]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[120px] cursor-pointer" onClick={() => requestSort('id')}>
            <div className="flex items-center justify-start gap-1">Invoice ID {getSortIndicator('id')}</div>
          </TableHead>
          <TableHead className="cursor-pointer" onClick={() => requestSort('customerName')}>
            <div className="flex items-center justify-start gap-1">Customer {getSortIndicator('customerName')}</div>
          </TableHead>
          <TableHead className="cursor-pointer" onClick={() => requestSort('orderDate')}>
            <div className="flex items-center justify-start gap-1">Date {getSortIndicator('orderDate')}</div>
          </TableHead>
          <TableHead className="cursor-pointer text-right" onClick={() => requestSort('grandTotal')}>
            <div className="flex items-center justify-end gap-1">Total {getSortIndicator('grandTotal')}</div>
          </TableHead>
          <TableHead className="cursor-pointer text-right" onClick={() => requestSort('balanceDue')}>
            <div className="flex items-center justify-end gap-1">Balance Due {getSortIndicator('balanceDue')}</div>
          </TableHead>
          <TableHead className="w-[150px] cursor-pointer text-center" onClick={() => requestSort('status')}>
            <div className="flex items-center justify-center gap-1">Status {getSortIndicator('status')}</div>
          </TableHead>
          <TableHead className="text-center min-w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.length > 0 ? (
          filtered.map((invoice) => (
            <TableRow
              key={invoice.id}
              onClick={() => {
                setSelectedInvoice(invoice);
                setIsSheetOpen(true);
                setTabValue('payments'); // ← THIS FIXES BLANK TAB
              }}
              className="cursor-pointer hover:bg-muted/50"
            >
              <TableCell className="font-medium">{invoice.id}</TableCell>
              <TableCell>{invoice.customerName}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{formatDate(invoice.orderDate)}</TableCell>
              <TableCell className="text-right">{formatCurrency(invoice.grandTotal)}</TableCell>
              <TableCell className={`text-right font-semibold ${(invoice.balanceDue ?? 0)> 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(invoice.balanceDue ?? 0)}
              </TableCell>
              <TableCell>
                <Badge variant={(invoice.status as string)=== 'Paid' ? 'default' : (invoice.status as string) === 'Partially Paid' ? 'secondary' : 'outline'}>
                  {invoice.status}
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                {(invoice.status as string) === 'Deleted' ? (
                  <div className="flex justify-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRestoreOrder(invoice);
                      }}
                      title="Restore order"
                    >
                      <RotateCcw className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadInvoice(invoice);
                      }}
                      title="Download invoice"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={(e) => e.stopPropagation()}
                          title="Permanently delete order"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Permanently Delete Order</AlertDialogTitle>
                          <AlertDialogDescription>
                            ⚠️ This will permanently delete order {invoice.id}. This action cannot be undone and the order cannot be restored.
                            <br /><br />
                            Are you absolutely sure?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePermanentDelete(invoice);
                            }}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Permanently Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ) : (
                  <Badge variant={(invoice.status as string) === 'Full Paid' ? 'default' : 'secondary'} className="capitalize">
                    {invoice.status}
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
              No invoices found in this category.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};

export const InvoicesClient = ({ logoUrl, orders: initialOrders = [], customers: initialCustomers = [] }: { logoUrl?: string, orders?: Order[], customers?: Customer[] }) => {
  const { allInvoices, customers, refreshOrders, loading } = useInvoiceData(initialOrders, initialCustomers);
  const { toast } = useToast();

  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMode] = useState<PaymentMode>('Cash');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [isReceiptLoading, setIsReceiptLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey | null; direction: 'ascending' | 'descending' }>({ key: null, direction: 'ascending' });
  const [activeTab, setActiveTab] = useState<'credit' | 'fullPaid' | 'deleted'>('credit');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Order | null>(null);
  const [receiptToPrint, setReceiptToPrint] = useState<{ order: Order; payment: Payment; historicalPayments: Payment[] } | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [tabValue, setTabValue] = useState('payments'); // ← THIS WAS THE ROOT CAUSE

  const creditInvoices = useMemo(() =>
    allInvoices.filter(inv =>
      (inv.balanceDue ?? 0) > 0 ||
      (inv.status as string) === 'Pending' ||
      (inv.status as string) === 'Part Payment'
    ),
    [allInvoices]
  );
  const fullPaidInvoices = useMemo(() =>
    allInvoices.filter(inv =>
      (inv.balanceDue ?? 0) === 0 &&
      ((inv.status as string) === 'Fulfilled' || (inv.status as string) === 'Paid')
    ),
    [allInvoices]
  );
  const deletedInvoices = useMemo(() =>
    allInvoices.filter(inv => (inv.status as string) === 'Deleted'),
    [allInvoices]
  );

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: SortKey) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="ml-1 h-4 w-4" />;
    return sortConfig.direction === 'ascending' ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  // YOUR ORIGINAL PDF CODE (left untouched)

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || parseFloat(paymentAmount) <= 0 || isPaymentLoading) return;
    console.log('Selected Invoice:', selectedInvoice); // ← Add this to debug ID
    console.log("About to record payment for order ID →", selectedInvoice.id);
    console.log("Firestore _id is →", (selectedInvoice as any)._id);
    setIsPaymentLoading(true);
    try {
      await addPaymentToOrder(
		selectedInvoice.customerId,
		selectedInvoice.id,
		{
			amount: parseFloat(paymentAmount),
			mode: paymentMethod,
			date: paymentDate,
			notes: paymentNotes,
			recordedBy: 'User'
		} as any
	);
      toast({ title: "Payment Recorded", description: `₹${paymentAmount} recorded.` });
      setPaymentAmount('');
      setPaymentNotes('');
      await refreshOrders();
    } catch (error) {
      console.error("Payment error:", error); // ← Better logging
      toast({ title: "Failed", description: "Could not record payment", variant: "destructive" });
    } finally {
      setIsPaymentLoading(false);
    }
  };

  // MOVED INSIDE COMPONENT — THIS WAS THE MAIN BUG
  const handleSharePayment = (payment: Payment, order: Order) => {
    const customer = customers.find(c => c.id === order.customerId);
    if (!customer) return;
    const message = `Hello ${customer.name}, payment of ₹${payment.amount.toFixed(2)} received for invoice ${order.id.replace('ORD', 'INV')}. Thank you! Balance: ₹${(order.balanceDue ?? 0).toFixed(2)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleDownloadReceipt = (payment: Payment, order: Order) => {
    const customer = customers.find(c => c.id === order.customerId);
    if (!customer) return;
    setReceiptToPrint({ order, payment, historicalPayments: order.payments || [] });
  };

  const handleDeletePayment = async (payment: Payment, order: Order) => {
    try {
      setIsPaymentLoading(true);
      await deletePaymentFromOrder(order.customerId, order.id, payment.id);
      toast({
        title: "Payment Deleted",
        description: `Payment of ${formatCurrency(payment.amount)} has been deleted. Balances have been recalculated.`
      });
      await refreshOrders();
    } catch (error) {
      console.error("Delete payment error:", error);
      toast({
        title: "Failed",
        description: "Could not delete payment",
        variant: "destructive"
      });
    } finally {
      setIsPaymentLoading(false);
    }
  };

  const handleRestoreOrder = async (order: Order) => {
    try {
      await updateOrder({ ...order, status: 'Pending', _isDeleted: false } as Order);
      toast({ title: 'Success', description: `Order ${order.id} has been restored.` });
      await refreshOrders();
    } catch (error) {
      console.error('Failed to restore order:', error);
      toast({ title: 'Error', description: 'Failed to restore order.', variant: 'destructive' });
    }
  };

  const handlePermanentDelete = async (order: Order) => {
    try {
      setIsPaymentLoading(true);
      await permanentlyDeleteOrder(order.id);
      toast({
        title: 'Order Permanently Deleted',
        description: `Order ${order.id} has been permanently removed from the database.`
      });
      await refreshOrders();
    } catch (error) {
      console.error('Failed to permanently delete order:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to permanently delete order.',
        variant: 'destructive'
      });
    } finally {
      setIsPaymentLoading(false);
    }
  };

  const handleDownloadInvoice = async (order: Order) => {
    try {
      const customer = customers.find(c => c.id === order.customerId);
      if (!customer) {
        toast({ title: 'Error', description: 'Customer not found.', variant: 'destructive' });
        return;
      }

      // DEBUG: Log addresses to console
      console.log('=== INVOICE ADDRESS DEBUG ===');
      console.log('Order ID:', order.id);
      console.log('Delivery Address:', order.deliveryAddress);
      console.log('Customer Address:', customer.address);
      console.log('Address being used:', order.deliveryAddress || customer.address);
      console.log('============================');

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Add logo if available
      if (logoUrl) {
        doc.addImage(logoUrl, 'PNG', 14, 10, 30, 30);
      }

      // Header
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('INVOICE', pageWidth - 14, 20, { align: 'right' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Invoice #: ${order.id.replace('ORD', 'INV')}`, pageWidth - 14, 28, { align: 'right' });
      doc.text(`Date: ${formatDate(order.orderDate)}`, pageWidth - 14, 34, { align: 'right' });

      // Company info
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('AB Agency', 14, 50);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('No.1, Ayyanchery main road, Ayyanchery, Urapakkam', 14, 56);
      doc.text('Chennai - 603210', 14, 61);
      doc.text('MOB: 95511 95505 / 95001 82975', 14, 66);

      // Customer info
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Bill To:', 14, 80);
      doc.setFont('helvetica', 'normal');
      doc.text(customer.name, 14, 86);
      const addressToUse = order.deliveryAddress || customer.address;
      if (addressToUse) {
        const addressLines = doc.splitTextToSize(addressToUse, 80);
        doc.text(addressLines, 14, 92);
      }

      // Items table
      const tableData = order.items.map(item => [
      item.productName,
        item.quantity.toString(),
        `₹${item.price.toFixed(2)}`,
        `₹${(item.quantity * item.price).toFixed(2)}`
      ]);

      autoTable(doc, {
        startY: 110,
        head: [['Item', 'Qty', 'Price', 'Total']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [71, 85, 105] },
      });

      // Totals
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(10);
      doc.text(`Subtotal: ₹${order.total.toFixed(2)}`, pageWidth - 14, finalY, { align: 'right' });
      if (order.discount) {
        doc.text(`Discount: -₹${order.discount.toFixed(2)}`, pageWidth - 14, finalY + 6, { align: 'right' });
      }
      if (order.deliveryFees) {
        doc.text(`Delivery: ₹${order.deliveryFees.toFixed(2)}`, pageWidth - 14, finalY + 12, { align: 'right' });
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(`Grand Total: ₹${order.grandTotal.toFixed(2)}`, pageWidth - 14, finalY + 20, { align: 'right' });

      doc.save(`${order.id.replace('ORD', 'INV')}.pdf`);
      toast({ title: 'Success', description: 'Invoice downloaded successfully.' });
    } catch (error) {
      console.error('Failed to generate invoice:', error);
      toast({ title: 'Error', description: 'Failed to generate invoice.', variant: 'destructive' });
    }
  };

  const handlePrintReceipt = async () => {
    if (!receiptToPrint || !receiptRef.current) return;

    setIsReceiptLoading(true);
    try {
      // Wait a moment for the render
      await new Promise(resolve => setTimeout(resolve, 250));

      // Capture with higher quality and ensure full height
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        windowHeight: receiptRef.current.scrollHeight,
        height: receiptRef.current.scrollHeight
      });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // Add margins
      const margin = 10;
      const availableWidth = pdfWidth - (2 * margin);
      const availableHeight = pdfHeight - (2 * margin);

      const canvasAspectRatio = canvas.width / canvas.height;

      // Calculate dimensions to fit within one page with margins
      let imgWidth = availableWidth;
      let imgHeight = imgWidth / canvasAspectRatio;

      // If still too tall, scale down to fit height
      if (imgHeight > availableHeight) {
        imgHeight = availableHeight;
        imgWidth = imgHeight * canvasAspectRatio;
      }

      // Center the image on the page
      const xOffset = (pdfWidth - imgWidth) / 2;
      const yOffset = (pdfHeight - imgHeight) / 2;

      pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidth, imgHeight);
      pdf.save(`RCPT-${receiptToPrint.order.id.replace('ORD', 'INV')}.pdf`);

      toast({ title: 'Success', description: 'Receipt PDF has been downloaded.' });
    } catch (error) {
      console.error('Failed to generate receipt:', error);
      toast({ title: 'Error', description: 'Failed to generate receipt PDF.', variant: 'destructive' });
    } finally {
      setIsReceiptLoading(false);
      setReceiptToPrint(null);
    }
  };

  useEffect(() => {
    if (receiptToPrint) {
      handlePrintReceipt();
    }
  }, [receiptToPrint]);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-3xl font-bold">Invoices</h1>
      <div className="flex justify-end items-center">
        <Input
          placeholder="Search by Invoice ID or Customer Name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'credit' | 'fullPaid' | 'deleted')} className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-t-lg border-b-0 bg-muted/50">
            <TabsTrigger value="credit">Credit Invoices ({creditInvoices.length})</TabsTrigger>
            <TabsTrigger value="fullPaid">Full Paid Invoices ({fullPaidInvoices.length})</TabsTrigger>
            <TabsTrigger value="deleted">Deleted Orders ({deletedInvoices.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="credit" className="mt-0">
            <InvoiceTable invoices={creditInvoices} searchTerm={searchTerm} sortConfig={sortConfig} requestSort={requestSort} getSortIndicator={getSortIndicator} setSelectedInvoice={setSelectedInvoice} setIsSheetOpen={setIsSheetOpen} setTabValue={setTabValue} handleRestoreOrder={handleRestoreOrder} handleDownloadInvoice={handleDownloadInvoice} handlePermanentDelete={handlePermanentDelete} />
          </TabsContent>
          <TabsContent value="fullPaid" className="mt-0">
            <InvoiceTable invoices={fullPaidInvoices} searchTerm={searchTerm} sortConfig={sortConfig} requestSort={requestSort} getSortIndicator={getSortIndicator} setSelectedInvoice={setSelectedInvoice} setIsSheetOpen={setIsSheetOpen} setTabValue={setTabValue} handleRestoreOrder={handleRestoreOrder} handleDownloadInvoice={handleDownloadInvoice} handlePermanentDelete={handlePermanentDelete} />
          </TabsContent>
          <TabsContent value="deleted" className="mt-0">
            <InvoiceTable invoices={deletedInvoices} searchTerm={searchTerm} sortConfig={sortConfig} requestSort={requestSort} getSortIndicator={getSortIndicator} setSelectedInvoice={setSelectedInvoice} setIsSheetOpen={setIsSheetOpen} setTabValue={setTabValue} handleRestoreOrder={handleRestoreOrder} handleDownloadInvoice={handleDownloadInvoice} handlePermanentDelete={handlePermanentDelete} />
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selectedInvoice ? `Invoice ${selectedInvoice.id}` : 'Invoice Details'}</SheetTitle>
            <SheetDescription>Review details and record payments for this invoice.</SheetDescription>
          </SheetHeader>

          {selectedInvoice && (
            <div className="h-full pt-4 flex flex flex-col">
              <Tabs value={tabValue} onValueChange={setTabValue} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="payments">Payments</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                {/* PAYMENT FORM — NOW VISIBLE */}
                <TabsContent value="payments" className="mt-4 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Invoice: {selectedInvoice.id.replace('ORD', 'INV')}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Manage payments for {selectedInvoice.customerName}.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-2 text-foreground">   {/* ← THIS LINE FIXES COLOR */}
                      <div className="flex justify-between">
                        <span>Previous Balance:</span>
                        <span>{formatCurrency(selectedInvoice.previousBalance ?? 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Current Bill:</span>
                        <span>{formatCurrency(selectedInvoice.grandTotal - (selectedInvoice.previousBalance ?? 0))}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>Total:</span>
                        <span>{formatCurrency(selectedInvoice.grandTotal)}</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold pt-2">
                        <span>Balance Due:</span>
                        <span className={`text-2xl font-bold ${(selectedInvoice.balanceDue ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
						  {(selectedInvoice.balanceDue ?? 0) > 0
						   ? formatCurrency(selectedInvoice.balanceDue ?? 0)
                            : 'NIL'
                          }
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  <Separator className="my-4" />
                  <Card>
                    <CardHeader><CardTitle>Record New Payment</CardTitle></CardHeader>
                    <CardContent>
                      <form onSubmit={handleRecordPayment} className="space-y-4">
                        <div className="space-y-2">
                          <Label>Amount to Pay</Label>
                          <Input type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div><Label>Date</Label><Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required /></div>
                          <div>
                            <Label>Method</Label>
                            <Select value={paymentMethod} onValueChange={(val) => setPaymentMode(val as PaymentMode)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Cash">Cash</SelectItem>
                                <SelectItem value="UPI">UPI</SelectItem>
                                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div><Label>Notes (Optional)</Label><Input value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} /></div>
                        <Button type="submit" className="w-full" disabled={isPaymentLoading}>
                          {isPaymentLoading ? 'Recording...' : 'Record Payment'}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* HISTORY — NOW SHOWS CORRECT DATES & WORKING BUTTONS */}
                <TabsContent value="history" className="mt-4 space-y-4">
                  <Card>
                    <CardHeader><CardTitle>Payment History</CardTitle></CardHeader>
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
                          {(selectedInvoice.payments?.length ?? 0) > 0 ? selectedInvoice.payments?.map((payment: any) => (
							  <TableRow key={payment.id}>
								<TableCell>{formatDate(payment.date)}</TableCell>
								<TableCell>{formatCurrency(payment.amount)}</TableCell>
								<TableCell>{payment.mode}</TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" onClick={() => handleSharePayment(payment, selectedInvoice)}>
                                  <MessageCircle className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDownloadReceipt(payment, selectedInvoice)}>
                                  <Download className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="sm" variant="ghost" disabled={isPaymentLoading}>
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Payment Receipt</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete this payment of {formatCurrency(payment.amount)} dated {formatDate(payment.date)}?
                                        This will recalculate the balance due and cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDeletePayment(payment, selectedInvoice)}
                                        className="bg-red-600 hover:bg-red-700"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </TableCell>
                            </TableRow>
                          )) : (
                            <TableRow><TableCell colSpan={4} className="text-center">No payments yet</TableCell></TableRow>
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

      {/* Your receipt modal unchanged */}
      {/* Hidden Receipt Template for Capture */}
      {receiptToPrint && (
        <div style={{ position: 'fixed', left: '-200vw', top: 0, zIndex: -1 }}>
          <ReceiptTemplate
            receiptRef={receiptRef}
            order={receiptToPrint.order}
            customer={customers.find(c => c.id === receiptToPrint.order.customerId)}
            payment={receiptToPrint.payment}
            historicalPayments={receiptToPrint.historicalPayments}
            logoUrl={logoUrl}
          />
        </div>
      )}
    </div>
  );
};