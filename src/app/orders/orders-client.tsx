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

interface jsPDFWithPlugin extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
  previousAutoTable: { finalY: number };
}


type SortKey = keyof Order | 'id' | 'customerName' | 'orderDate' | 'status' | 'grandTotal';

const formatNumberForDisplay = (value: number | undefined) => {
    if (value === undefined || isNaN(value)) return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(0);
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', currencyDisplay: 'symbol' }).format(value);
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
    const [dateFilter, setDateFilter] = useState('All');
    const [isMounted, setIsMounted] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' } | null>(null);
    
    useEffect(() => {
        setIsMounted(true);
        const savedLogo = localStorage.getItem('companyLogo');
        if (savedLogo) {
            setLogoUrl(savedLogo);
        }
    }, []);

    const openOrderDialog = async () => {
        setIsLoading(true);
        try {
            const freshProducts = await getProducts();
            setProducts(freshProducts);
            setIsAddOrderOpen(true);
        } catch(e) {
            toast({ title: 'Error', description: 'Could not fetch latest product data.', variant: 'destructive'});
        } finally {
            setIsLoading(false);
        }
    }
    
    const openEditDialog = async (order: Order) => {
        setIsLoading(true);
        try {
            const freshProducts = await getProducts();
            setProducts(freshProducts);
            setOrderToEdit(order);
        } catch(e) {
            toast({ title: 'Error', description: 'Could not fetch latest product data.', variant: 'destructive'});
        } finally {
            setIsLoading(false);
        }
    }

    const requestSort = (key: SortKey) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const sortedOrders = useMemo(() => {
        let sortableItems = [...orders];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];

                if (aValue === undefined || aValue === null) return 1;
                if (bValue === undefined || bValue === null) return -1;
                
                if (sortConfig.key === 'orderDate') {
                    const dateA = new Date(aValue as string).getTime();
                    const dateB = new Date(bValue as string).getTime();
                    if (isNaN(dateA)) return 1;
                    if (isNaN(dateB)) return -1;
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
    }, [orders, sortConfig]);


    const filteredOrders = useMemo(() => {
        const now = new Date();
        let filtered = sortedOrders.filter(order =>
            order.status !== 'Deleted' && order.status !== 'Canceled' && (
                order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                order.customerName.toLowerCase().includes(searchQuery.toLowerCase())
            )
        );

        if (dateFilter !== 'All') {
            let interval: Interval;
            if (dateFilter === 'This Week') {
                interval = { start: startOfWeek(now), end: now };
            } else if (dateFilter === 'This Month') {
                interval = { start: startOfMonth(now), end: now };
            } else if (dateFilter === 'Last Month') {
                const startOfThisMonth = startOfMonth(now);
                const startOfLastMonth = subMonths(startOfThisMonth, 1);
                interval = { start: startOfLastMonth, end: startOfThisMonth };
            }
             filtered = filtered.filter(order => {
                const orderDate = new Date(order.orderDate);
                return isWithinInterval(orderDate, interval);
            });
        }
        
        return filtered;
    }, [sortedOrders, searchQuery, dateFilter]);

    const handleGenerateInvoice = (order: Order) => {
        setOrderToPrint(order);
    };
    
    useEffect(() => {
        if (orderToPrint) {
            handlePrint();
        }
    }, [orderToPrint]);

    const handleWhatsAppShare = (order: Order) => {
        const customer = customers.find(c => c.id === order.customerId);
        if (!customer || !customer.phone) {
            toast({ title: 'WhatsApp Error', description: `No phone number found.`, variant: 'destructive' });
            return;
        }
        
        const cleanName = customer.name.replace(' (Walk-In)', '');
        const sanitizedPhone = customer.phone.replace(/\D/g, '');
        const finalPhone = sanitizedPhone.length === 10 ? `91${sanitizedPhone}` : sanitizedPhone;
        const formattedAmount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.grandTotal).replace(/\u00A0/g, ' '); 
        const invoiceId = order.id.replace('ORD', 'INV');

        const message = `Hello *${cleanName}*,%0A%0AHere is your invoice *${invoiceId}* from *AB Agency*.%0A%0A*Grand Total:* ${formattedAmount}%0A%0AThank you for your business!`;
        
        const whatsappUrl = `https://wa.me/${finalPhone}?text=${message}`;
        window.open(whatsappUrl, '_blank');
    }; // Only ONE closing brace here.

    const handlePrint = async () => {
        if (!orderToPrint) return;

        const customer = customers.find(c => c.id === orderToPrint.customerId);
        if(!customer) return;

        setIsLoading(true);
        try {
            const doc = new jsPDF() as jsPDFWithPlugin;;
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 14;

            const formatNumber = (value: number | undefined) => {
                if (value === undefined || isNaN(value)) return `INR 0.00`;
                return `INR ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
            };
            
            const formatQuantity = (item: any) => {
                if (isWeightBased(item.category)) {
                    return `${item.quantity} nos`;
                }
                 if (item.calculationType === 'Per Kg') {
                    return `${(item.quantity).toFixed(2)} kg`;
                }
                return `${item.quantity} pcs`;
            }
            
            const formatRate = (item: any) => {
                let rate = formatNumber(item.price);
                 if (item.calculationType === 'Per Kg') {
                    rate += '/kg';
                }
                return rate;
            }

            if (logoUrl) {
                const logoWidth = 25; 
                const logoHeight = 20;
                doc.addImage(logoUrl, 'PNG', pageWidth / 2 - (logoWidth/2), 15, logoWidth, logoHeight);
            }
            
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text('No.1, Ayyanchery main road, Urapakkam, Chennai - 603210', pageWidth / 2, 40, { align: 'center' });
            doc.text('Email: abagency1977@gmail.com | MOB: 95511 95505 / 95001 82975', pageWidth / 2, 44, { align: 'center' });
            
            doc.setDrawColor(200, 200, 200);
            doc.line(margin, 48, pageWidth - margin, 48);

            let yPos = 58;
            const rightColX = pageWidth - margin;

            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Billed To:', margin, yPos);
            doc.setFont('helvetica', 'normal');
            yPos += 5;
            doc.text(customer.name, margin, yPos);
            yPos += 5;
            const addressLines = doc.splitTextToSize(customer.address || 'No address provided', 80);
            doc.text(addressLines, margin, yPos);
            yPos += (addressLines.length * 5); 
            doc.text(`Phone: ${customer.phone || 'N/A'}`, margin, yPos);
            yPos += 5;
            if (customer.gstin) {
                 doc.text(`GSTIN: ${customer.gstin}`, margin, yPos);
            }
            
            let rightYPos = 58;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('GSTIN: 33DMLPA8598D1ZU', rightColX, rightYPos, { align: 'right' });
            rightYPos += 8;
            
            doc.setFontSize(11);
            if (orderToPrint.paymentTerm === 'Credit') {
                doc.setTextColor(255, 0, 0); 
                doc.text('CREDIT INVOICE', rightColX, rightYPos, { align: 'right' });
            } else {
                doc.setTextColor(0, 128, 0); 
                doc.text('INVOICE', rightColX, rightYPos, { align: 'right' });
            }
            doc.setTextColor(0, 0, 0);
            rightYPos += 10;
            
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Invoice No: ${orderToPrint.id.replace('ORD', 'INV')}`, rightColX, rightYPos, { align: 'right' });
            rightYPos += 5;
            doc.text(`Date: ${new Date(orderToPrint.orderDate).toLocaleDateString('en-IN')}`, rightColX, rightYPos, { align: 'right' });
            rightYPos += 5;
            
            if (orderToPrint.dueDate) {
                doc.text(`Due Date: ${new Date(orderToPrint.dueDate).toLocaleDateString('en-IN')}`, rightColX, rightYPos, { align: 'right' });
                rightYPos += 5;
            }
             if (orderToPrint.deliveryDate) {
                doc.text(`Delivery Date: ${new Date(orderToPrint.deliveryDate).toLocaleDateString('en-IN')}`, rightColX, rightYPos, { align: 'right' });
            }

            const tableStartY = Math.max(yPos, rightYPos) + 10;
            const tableBody = orderToPrint.items.map(item => {
                const totalValue = orderToPrint.isGstInvoice
                   ? item.price * (isWeightBased(item.category) && item.totalWeight ? item.totalWeight : item.quantity) * (1 + item.gst / 100)
                   : item.price * (isWeightBased(item.category) && item.totalWeight ? item.totalWeight : item.quantity);

                let description = item.productName;
                if (item.brand) {
                    description += ` (Brand: ${item.brand})`;
                }

                return [
                    description,
                    formatQuantity(item),
                    isWeightBased(item.category) && item.totalWeight ? `${item.totalWeight?.toFixed(2)} kg` : 'N/A',
                    formatRate(item),
                    orderToPrint.isGstInvoice ? `${item.gst}%` : 'N/A',
                    formatNumber(totalValue)
                ];
            });

            (doc as any).autoTable({
                startY: tableStartY,
                head: [['Item Description', 'Quantity', 'Total Weight', 'Rate', 'GST', 'Total']],
                body: tableBody,
                theme: 'grid',
                headStyles: {
                    fillColor: [204, 229, 255], // Light blue
                    textColor: [3, 7, 6], 
                    fontStyle: 'bold',
                },
                styles: {
                    cellPadding: 2,
                    fontSize: 9,
                },
                columnStyles: {
                    0: { cellWidth: 60 }, 
                    1: { halign: 'center' },
                    2: { halign: 'center' },
                    3: { halign: 'right' },
                    4: { halign: 'center' },
                    5: { halign: 'right' },
                }
            });

            let finalY = (doc as any).previousAutoTable.finalY + 10;
            const totalsRightColX = pageWidth - margin;
            const totalsLeftColX = totalsRightColX - 50; 
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');

            const addTotalRow = (label: string, value: number, isBold = false) => {
                if (isBold) {
                    doc.setFont('helvetica', 'bold');
                }
                doc.text(label, totalsLeftColX, finalY, { align: 'right' });
                doc.text(formatNumber(value), totalsRightColX, finalY, { align: 'right' });
                if (isBold) {
                    doc.setFont('helvetica', 'normal');
                }
                finalY += 6;
            };

            const subTotal = orderToPrint.total + orderToPrint.deliveryFees - orderToPrint.discount;

            addTotalRow("Current Items Total:", orderToPrint.total);
            if(orderToPrint.deliveryFees > 0) addTotalRow("Delivery Fees:", orderToPrint.deliveryFees);
            if(orderToPrint.discount > 0) addTotalRow("Discount:", -orderToPrint.discount);
            addTotalRow("Subtotal:", subTotal, true);
            if(orderToPrint.previousBalance > 0) addTotalRow("Previous Balance:", orderToPrint.previousBalance);


            finalY += 2; 
            
            const grandTotalText = `Grand Total: ${formatNumber(orderToPrint.grandTotal)}`;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            
            const isCredit = orderToPrint.paymentTerm === 'Credit' && (orderToPrint.balanceDue ?? 0) > 0;
            const boxColor = isCredit ? [255, 235, 238] : [222, 247, 236]; 
            const textColor = isCredit ? [220, 38, 38] : [22, 101, 52]; 
            
            doc.setFillColor(...boxColor);
            doc.setDrawColor(...boxColor);
            doc.roundedRect(margin, finalY - 5, pageWidth - (margin * 2), 10, 3, 3, 'FD');
            
            doc.setTextColor(...textColor);
            doc.text(grandTotalText, pageWidth/2, finalY, { align: 'center' });
            
            doc.setTextColor(0,0,0);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            
            const footerY = doc.internal.pageSize.getHeight() - 15;
            doc.text('Thank you for your business!', pageWidth/2, footerY, { align: 'center'});
            doc.text('This is a computer-generated invoice and does not require a signature.', pageWidth/2, footerY + 4, { align: 'center'});


            doc.save(`invoice-${orderToPrint.id.replace('ORD','INV')}.pdf`);
            toast({ title: 'Success', description: 'Invoice PDF has been downloaded.' });
            
        } catch (error) {
            console.error('Failed to generate invoice:', error);
            toast({ title: 'Error', description: 'Failed to generate invoice PDF.', variant: 'destructive'});
        } finally {
            setIsLoading(false);
            setOrderToPrint(null);
        }
    };

    const refreshData = async () => {
        const { orders: refreshedOrders, customers: refreshedCustomers } = await getCoreOrderData();
        setOrders(refreshedOrders);
        setCustomers(refreshedCustomers);
    }

    const handleAddOrder = async (newOrderData: Omit<Order, 'id' | 'customerName'>) => {
       try {
           const newOrder = await addOrder(newOrderData);
           await refreshData();
           toast({
               title: "Order Placed",
               description: `Order ${newOrder.id} has been successfully created.`,
           });
           return newOrder;
       } catch (e: any) {
           console.error("Error details:", e);
           toast({
              title: "Error Placing Order",
              description: e.message || "Failed to save the new order.",
              variant: "destructive"
          });
          throw e; // re-throw to be caught in the dialog
       }
    };

    const handleUpdateOrder = async (updatedOrderData: Order) => {
       try {
           await updateOrder(updatedOrderData);
           await refreshData();
           toast({
               title: "Order Updated",
               description: `Order ${updatedOrderData.id} has been successfully updated.`,
           });
       } catch (e: any) {
           console.error("Error details:", e);
           toast({
              title: "Error Updating Order",
              description: e.message || "Failed to save the order changes.",
              variant: "destructive"
          });
          throw e; // re-throw to be caught in the dialog
       }
    };

    const handleDeleteOrder = async () => {
        if (!orderToDelete) return;
        try {
            await deleteOrderFromDB(orderToDelete);
            await refreshData();
            toast({
                title: "Order Deleted",
                description: `Order ${orderToDelete.id} has been successfully deleted.`
            });
        } catch (error: any) {
             toast({
                title: "Error Deleting Order",
                description: error.message || "Could not delete the order.",
                variant: "destructive"
            });
        } finally {
            setOrderToDelete(null);
        }
    }

    const handleAddCustomerSubmit = async (newCustomerData: Omit<Customer, 'id' | 'transactionHistory' | 'orders'>) => {
        try {
            const newCustomerWithHistory = await addCustomer(newCustomerData);
            const newCustomer: Customer = {
                ...newCustomerWithHistory,
                orders: []
            };
            setCustomers(prevCustomers => [...prevCustomers, newCustomer]);
            toast({
                title: "Customer Added",
                description: `${newCustomer.name} has been successfully added.`,
            });
            return newCustomer;
        } catch(e) {
             toast({
                title: "Error Adding Customer",
                description: "Failed to save the new customer.",
                variant: "destructive"
            });
            return null;
        }
    };

    const handleExportToExcel = () => {
        const worksheetData = filteredOrders.map(order => {
            const itemsSummary = order.items.map(item => {
                let quantityStr = `${item.quantity}`;
                if (isWeightBased(item.category)) {
                    quantityStr += ` nos (${item.totalWeight?.toFixed(2)} kg)`;
                } else if (item.calculationType === 'Per Kg') {
                    quantityStr += ' kg';
                }
                return `${item.productName} (Qty: ${quantityStr})`;
            }).join('; ');

            return {
                'Order ID': order.id.replace('ORD', 'INV'),
                'Customer Name': order.customerName,
                'Order Date': new Date(order.orderDate).toLocaleDateString('en-IN'),
                'Status': order.status,
                'Items': itemsSummary,
                'Items Total': order.total,
                'Delivery Fees': order.deliveryFees,
                'Discount': order.discount,
                'Subtotal': order.total + order.deliveryFees - order.discount,
                'Previous Balance': order.previousBalance,
                'Grand Total': order.grandTotal,
                'Balance Due': order.balanceDue ?? 0,
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
        XLSX.writeFile(workbook, "orders_export.xlsx");
    };

    if (!isMounted) {
        return (
            <div className="space-y-4 p-6">
                <Skeleton className="h-10 w-48" />
                <div className="rounded-lg border p-4 space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                <h1 className="text-3xl font-bold">Orders</h1>
                <div className="flex gap-2">
                    <Button onClick={handleExportToExcel} variant="outline">
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Export to Excel
                    </Button>
                    <Button onClick={openOrderDialog} disabled={isLoading} className="transform hover:scale-105 transition-transform">
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                        Place Order
                    </Button>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <Input 
                    placeholder="Search by Order ID or Customer Name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="max-w-sm"
                />
                <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by date" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">All Time</SelectItem>
                        <SelectItem value="This Week">This Week</SelectItem>
                        <SelectItem value="This Month">This Month</SelectItem>
                        <SelectItem value="Last Month">Last Month</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="hidden md:block rounded-lg border shadow-sm overflow-x-auto">
                <Table className="min-w-[800px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('id')}>Order ID <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('customerName')}>Customer <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('orderDate')}>Date <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('status')}>Status <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead className="text-right"><Button variant="ghost" onClick={() => requestSort('grandTotal')}>Total <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredOrders.map((order) => (
                            <TableRow key={order.id}>
                                <TableCell className="font-medium">{order.id}</TableCell>
                                <TableCell>{order.customerName}</TableCell>
                                <TableCell>{new Date(order.orderDate).toLocaleDateString('en-IN')}</TableCell>
                                <TableCell>
                                    <Badge variant={order.status === 'Fulfilled' ? 'default' : order.status === 'Pending' ? 'secondary' : 'outline'}>{order.status}</Badge>
                                </TableCell>
                                <TableCell className="text-right">{formatNumberForDisplay(order.grandTotal)}</TableCell>
                                <TableCell className="text-center">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => openEditDialog(order)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleGenerateInvoice(order)}><FileText className="mr-2 h-4 w-4" /> Generate Invoice</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleWhatsAppShare(order)}><Share2 className="mr-2 h-4 w-4" /> Share via WhatsApp</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => setOrderToDelete(order)} className="text-red-600"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <div className="grid gap-4 md:hidden">
                {filteredOrders.map((order) => (
                    <Card key={order.id}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{order.id}</CardTitle>
                            <Badge variant={order.status === 'Fulfilled' ? 'default' : 'secondary'}>{order.status}</Badge>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatNumberForDisplay(order.grandTotal)}</div>
                            <p className="text-xs text-muted-foreground">{order.customerName}</p>
                            <div className="flex justify-end gap-2 mt-4">
                                <Button size="sm" variant="outline" onClick={() => handleWhatsAppShare(order)}><Share2 className="h-4 w-4" /></Button>
                                <Button size="sm" onClick={() => handleGenerateInvoice(order)}><FileText className="h-4 w-4" /></Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <AddOrderDialog
                isOpen={isAddOrderOpen || !!orderToEdit}
                onOpenChange={(open) => { if (!open) { setIsAddOrderOpen(false); setOrderToEdit(null); } }}
                customers={customers}
                products={products}
                orders={orders}
                onOrderAdded={handleAddOrder}
                onOrderUpdated={handleUpdateOrder}
                onCustomerAdded={handleAddCustomerSubmit}
                existingOrder={orderToEdit}
            />

            <AlertDialog open={!!orderToDelete} onOpenChange={(open) => !open && setOrderToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>This action will permanently delete order {orderToDelete?.id}. Item quantities will be restored to stock.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setOrderToDelete(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteOrder}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

// Categories that require weight-based pricing
const WEIGHT_BASED_CATEGORIES: string[] = ['Rods & Rings', 'Savukku Stick'];
const isWeightBased = (category: string) => WEIGHT_BASED_CATEGORIES.includes(category);

const initialItemState = { productId: '', quantity: '', price: '', cost: '', gst: '', stock: 0, calculationType: 'Per Unit' as CalculationType, category: 'General' as ProductCategory, weightPerUnit: 0, totalWeight: '' };
type OrderItemState = { productId: string, quantity: string, price: string, cost: string, gst: string, stock: number, calculationType: CalculationType, category: ProductCategory, weightPerUnit: number, totalWeight: string };

function AddOrderDialog({ isOpen, onOpenChange, customers, products, orders, onOrderAdded, onOrderUpdated, onCustomerAdded, existingOrder }: {
    isOpen: boolean,
    onOpenChange: (open: boolean) => void,
    customers: Customer[],
    products: Product[],
    orders: Order[],
    onOrderAdded: (order: Omit<Order, 'id' | 'customerName'>) => Promise<Order>,
    onOrderUpdated: (order: Order) => Promise<void>,
    onCustomerAdded: (customer: Omit<Customer, 'id'|'transactionHistory' | 'orders'>) => Promise<Customer | null>,
    existingOrder: Order | null,
}) {
	const [isWalkIn, setIsWalkIn] = useState(false); // 👈 Add this here
	const [walkInName, setWalkInName] = useState('');
	const [walkInPhone, setWalkInPhone] = useState('');
    const [customerId, setCustomerId] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<OrderItemState[]>([]);
	const [partPaymentAmount, setPartPaymentAmount] = useState<string>('');
	
    const [currentItem, setCurrentItem] = useState<OrderItemState>(initialItemState);
    const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

    const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
    const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>('Full Payment');
    const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
    const [paymentRemarks, setPaymentRemarks] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [deliveryDate, setDeliveryDate] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [isGstInvoice, setIsGstInvoice] = useState(true);
    const [enableDiscount, setEnableDiscount] = useState(false);
    const [discount, setDiscount] = useState(0);
    const [deliveryFees, setDeliveryFees] = useState(0);
    const [previousBalance, setPreviousBalance] = useState(0);
    const [isFirstOrder, setIsFirstOrder] = useState(false);

    const { toast } = useToast();
    
    const isEditMode = !!existingOrder;

    const resetForm = useCallback(() => {
        setCustomerId('');
        setIsWalkIn(false);
        setWalkInName('');
        setWalkInPhone('');
        setOrderDate(new Date().toISOString().split('T')[0]);
        setItems([]);
        setCurrentItem(initialItemState);
        setEditingItemIndex(null);
        setPaymentTerm('Full Payment');
        setPaymentMode('Cash');
        setPaymentRemarks('');
        setDueDate('');
        setDeliveryDate('');
        setDeliveryAddress('');
        setIsGstInvoice(true);
        setEnableDiscount(false);
        setDiscount(0);
        setDeliveryFees(0);
        setPreviousBalance(0);
        setIsFirstOrder(false);
        onOpenChange(false);
    }, [onOpenChange]);
	
    useEffect(() => {
        if (isOpen && existingOrder) {
            // 1. Handle Walk-In detection
            const isOrderWalkIn = existingOrder.customerName.includes('(Walk-In)');
            setIsWalkIn(isOrderWalkIn);

            if (isOrderWalkIn) {
                setWalkInName(existingOrder.customerName.replace(' (Walk-In)', ''));
                const cust = customers.find(c => c.id === existingOrder.customerId);
                setWalkInPhone(cust?.phone || '');
                setCustomerId('');
            } else {
                setCustomerId(existingOrder.customerId);
                setWalkInName('');
                setWalkInPhone('');
            }

            // 2. Load basic order info
            setOrderDate(new Date(existingOrder.orderDate).toISOString().split('T')[0]);
            setItems(existingOrder.items.map(item => {
                const product = products.find(p => p.id === item.productId);
                return {
                    productId: item.productId,
                    quantity: String(item.quantity),
                    price: String(item.price),
                    cost: String(item.cost),
                    gst: String(item.gst),
                    stock: (product?.stock ?? 0) + (isEditMode ? item.quantity : 0),
                    calculationType: item.calculationType || 'Per Unit',
                    category: product?.category || 'General',
                    weightPerUnit: product?.weightPerUnit || 0,
                    totalWeight: ''
                }
            }));
            
            // 3. Handle Payment Terms & States
            setPaymentTerm(existingOrder.paymentTerm);
            
            if (existingOrder.paymentTerm === 'Full Payment' && existingOrder.payments?.length > 0) {
                setPaymentMode(existingOrder.payments[0].method || 'Cash');
                setPaymentRemarks(existingOrder.payments[0].notes || '');
                setPartPaymentAmount('');
            } 
            else if (existingOrder.paymentTerm === 'Part Payment') {
                if (existingOrder.payments?.length > 0) {
                    setPaymentMode(existingOrder.payments[0].method || 'Cash');
                    setPaymentRemarks(existingOrder.payments[0].notes || '');
                }
                setPartPaymentAmount(''); // Keep clear for fresh entries while editing
            } 
            else {
                setDueDate(existingOrder.dueDate ? new Date(existingOrder.dueDate).toISOString().split('T')[0] : '');
                setPartPaymentAmount('');
            }
            
            // 4. Load remaining fields
            setDeliveryDate(existingOrder.deliveryDate ? new Date(existingOrder.deliveryDate).toISOString().split('T')[0] : '');
            setDeliveryAddress(existingOrder.deliveryAddress || '');
            setIsGstInvoice(existingOrder.isGstInvoice);
            setDiscount(existingOrder.discount);
            setEnableDiscount(existingOrder.discount > 0);
            setDeliveryFees(existingOrder.deliveryFees);
            setPreviousBalance(existingOrder.previousBalance);

        } else if (isOpen && !existingOrder) {
            // --- NEW ORDER RESET ---
            setCustomerId('');
            setIsWalkIn(false);
            setWalkInName('');
            setWalkInPhone('');
            setPartPaymentAmount('');
            setOrderDate(new Date().toISOString().split('T')[0]);
            setItems([]);
            setPaymentTerm('Full Payment');
            setPreviousBalance(0);
            setDiscount(0);
            setDeliveryFees(0);
            setEnableDiscount(false);
            setDeliveryAddress('');
            setPaymentMode('Cash');
            setPaymentRemarks('');
        }
    }, [isOpen, existingOrder, products, customers, isEditMode]);


    useEffect(() => {
         console.log('🔍 DEBUG: useEffect running', {
        isOpen,
        isEditMode,
        existingOrder: existingOrder?.id,
        currentDeliveryAddress: deliveryAddress
    });
		const fetchBalance = async () => {
            if (customerId) {
                const customerOrders = orders.filter(o => o.customerId === customerId);
                const hasOrders = customerOrders.length > 0;
                 if (isEditMode && existingOrder?.id) {
                    setIsFirstOrder(customerOrders.length === 1 && customerOrders[0].id === existingOrder.id);
                 } else {
                    setIsFirstOrder(!hasOrders);
                 }

                if (isEditMode && existingOrder) {
                    setPreviousBalance(existingOrder.previousBalance);
					
                } else if (hasOrders) {
                    const balance = await getCustomerBalance(customerId);
                    setPreviousBalance(balance);
                } else {
                    setPreviousBalance(0);
                }

            } else {
                setPreviousBalance(0);
                setIsFirstOrder(false);
            }
        };
        if (isOpen) {
          fetchBalance();
        }
    }, [customerId, customers, orders, isOpen, isEditMode, existingOrder]);


    const handleProductSelect = (productId: string) => {
        const product = products.find(p => p.id === productId);
        if (product) {
            setCurrentItem({
                productId: product.id,
                quantity: '',
                price: String(product.salePrice || product.price || 0),
                cost: String(product.costPrice || 0),
                gst: String(product.gst || 0),
                stock: product.stock,
                calculationType: product.calculationType || 'Per Unit',
                category: product.category || 'General',
                weightPerUnit: product.weightPerUnit || 0,
                totalWeight: ''
            });
        }
    };
    
    const handleAddItem = () => {
        if (!currentItem.productId) {
            toast({ title: 'Error', description: 'Please select an item.', variant: 'destructive' });
            return;
        }

        const quantity = parseFloat(currentItem.quantity);
        if (isNaN(quantity) || quantity <= 0) {
            toast({ title: 'Error', description: 'Please enter a valid quantity.', variant: 'destructive' });
            return;
        }

        if (quantity > currentItem.stock) {
            toast({ title: 'Stock Error', description: `Not enough stock for ${products.find(p=>p.id===currentItem.productId)?.name}. Available: ${currentItem.stock}`, variant: 'destructive' });
            return;
        }
        setItems([...items, currentItem]);
        setCurrentItem(initialItemState);
    };
    
    const handleUpdateItem = () => {
        if (editingItemIndex === null) return;
        const quantity = parseFloat(currentItem.quantity);
         if (isNaN(quantity) || quantity <= 0) {
            toast({ title: 'Error', description: 'Please enter a valid quantity.', variant: 'destructive' });
            return;
        }
        if (quantity > currentItem.stock) {
            toast({ title: 'Stock Error', description: `Not enough stock for ${products.find(p=>p.id===currentItem.productId)?.name}. Available: ${currentItem.stock}`, variant: 'destructive' });
            return;
        }
        const newItems = [...items];
        newItems[editingItemIndex] = currentItem;
        setItems(newItems);
        setCurrentItem(initialItemState);
        setEditingItemIndex(null);
    };

    const handleEditItemClick = (index: number) => {
        setEditingItemIndex(index);
        const itemToEdit = items[index];
        const product = products.find(p => p.id === itemToEdit.productId);
        
        let stock = product?.stock || 0;
        if (isEditMode) {
            const originalItem = existingOrder?.items.find(i => i.productId === itemToEdit.productId);
            if (originalItem) {
                stock += originalItem.quantity;
            }
        }

        setCurrentItem({ ...itemToEdit, stock: stock });
    };
    
    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const handleAddCustomerSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const newCustomerData = {
            name: formData.get('name') as string,
            phone: formData.get('phone') as string,
            address: formData.get('address') as string,
        };
        const newCustomer = await onCustomerAdded(newCustomerData);
        if (newCustomer) {
            setIsAddCustomerOpen(false);
            setCustomerId(newCustomer.id);
        }
    };

    const { currentInvoiceTotal, subTotal, grandTotal } = useMemo(() => {
        const currentItemsTotal = items.reduce((sum, item) => {
            const price = parseFloat(item.price) || 0;
            const quantity = parseFloat(item.quantity) || 0;
            if (isWeightBased(item.category)) {
                const weight = parseFloat(item.totalWeight) || (quantity * (item.weightPerUnit || 0));
                return sum + (price * weight);
            }
            return sum + (price * quantity);
        }, 0);
        
        const totalGst = isGstInvoice 
            ? items.reduce((sum, item) => {
                const price = parseFloat(item.price) || 0;
                const quantity = parseFloat(item.quantity) || 0;
                const gst = parseFloat(item.gst) || 0;
                if (isWeightBased(item.category)) {
                    const weight = parseFloat(item.totalWeight) || (quantity * (item.weightPerUnit || 0));
                    return sum + (price * weight * (gst / 100));
                }
                return sum + (price * quantity * (gst / 100));
            }, 0)
            : 0;
        
        const currentInvoiceTotal = currentItemsTotal + totalGst;
        const subTotal = currentInvoiceTotal + deliveryFees - discount;
        const grandTotal = subTotal + previousBalance;

        return { currentInvoiceTotal, subTotal, grandTotal };
    }, [items, isGstInvoice, deliveryFees, discount, previousBalance]);


    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        let finalCustomerId = customerId;
        let finalCustomerName = '';

        if (isWalkIn) {
            if (!walkInName) {
                toast({ title: "Name Required", description: "Please enter a customer name.", variant: "destructive" });
                return;
            }

            const cleanPhone = walkInPhone.replace(/\D/g,'');
            const existing = cleanPhone ? customers.find(c => c.phone?.replace(/\D/g,'').includes(cleanPhone)) : null;
            
            if (existing) {
                finalCustomerId = existing.id;
                finalCustomerName = existing.name;
                toast({ title: "Linking to Profile", description: `Order added to existing record: ${existing.name}` });
            } else {
                const newCust = await onCustomerAdded({
                    name: `${walkInName} (Walk-In)`,
                    phone: walkInPhone,
                    address: 'Counter Sale',
                    gstin: ''
                });
                if (newCust) {
                    finalCustomerId = newCust.id;
                    finalCustomerName = newCust.name;
                } else {
                    toast({ title: "Error", description: "Failed to create customer record.", variant: "destructive" });
                    return;
                }
            }
        } else {
            if (!customerId) {
                toast({ title: "Selection Required", description: "Please select a customer.", variant: "destructive" });
                return;
            }
            const customer = customers.find(c => c.id === customerId);
            finalCustomerName = customer?.name || '';
        }

        if (items.length === 0) {
            toast({ title: "Empty Order", description: "Please add at least one item.", variant: "destructive" });
            return;
        }

        // --- BULLETPROOF STATUS & BALANCE LOGIC ---
        // We use .includes and .toLowerCase to make sure "Full payment", "Paid", or "Full Payment" all work.
        // --- SCRUTINY MASTER: Unified Payment & Status Logic ---
        const term = (paymentTerm || '').toLowerCase();
        let currentStatus = 'Pending';
        let initialPayments = [];

        if (term.includes('full')) {
            // Logic for 100% Payment
            currentStatus = 'Fulfilled';
            initialPayments = [{
                id: `pay_${Date.now()}`,
                date: orderDate,
                amount: grandTotal,
                mode: paymentMode,
                notes: paymentRemarks || 'Full Payment on Order'
            }];
        } else if (term === 'part payment') {
            // Logic for Partial Payment
            const paidNow = parseFloat(partPaymentAmount) || 0;
            
            // Scrutiny Check: If they paid the exact total, mark as Fulfilled anyway
            if (paidNow >= grandTotal) {
                currentStatus = 'Fulfilled';
            } else {
                currentStatus = 'Partially Paid';
            }

            if (paidNow > 0) {
                initialPayments = [{
                    id: `pay_${Date.now()}`,
                    date: orderDate,
                    amount: paidNow,
                    mode: paymentMode,
                    notes: paymentRemarks || 'Initial Part Payment'
                }];
            }
        } 
        // If it's 'Credit', initialPayments remains an empty array []

        const totalPaidNow = initialPayments.reduce((sum, p) => sum + p.amount, 0);
        const balanceRemaining = grandTotal - totalPaidNow;

        const orderData: any = {
            customerId: finalCustomerId,
            customerName: finalCustomerName,
            orderDate,
            items: items.map(item => {
                const product = products.find(p => p.id === item.productId);
                return {
                    ...item,
                    productName: product?.name || 'Unknown',
                    quantity: parseFloat(item.quantity) || 0,
                    price: parseFloat(item.price) || 0,
                    total: (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0),
                    gst: parseFloat(item.gst) || 0
                };
            }),
            total: currentInvoiceTotal,
            previousBalance: previousBalance,
            discount: discount,
            deliveryFees: deliveryFees,
            grandTotal: grandTotal,
            paymentTerm: paymentTerm,
            deliveryAddress: deliveryAddress || 'Counter Sale',
            isGstInvoice: isGstInvoice,
            status: currentStatus,
            balanceDue: balanceRemaining,
            payments: initialPayments 
        };

    const customerOptions = useMemo(() => customers.map(c => ({ value: c.id, label: c.name })), [customers]);
    const productOptions = useMemo(() => {
        return products.filter(p => p.name !== 'Outstanding Balance').map(p => ({ value: p.id, label: `${p.name} (SKU: ${p.sku})` }));
    }, [products]);


    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => { if(!open) resetForm(); else onOpenChange(open);}}>
                <DialogContent className="max-w-6xl w-[98vw] p-2 sm:p-6 h-[95vh] flex flex-col" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>{isEditMode ? `Edit Order ${existingOrder?.id}`: 'Place New Order'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit}>
                        <ScrollArea className="h-[70vh]">
                            <div className="space-y-4 p-4">
                                <Card>
                                    <CardContent className="p-4 space-y-4 rounded-lg">
                                        <DialogTitle className="text-lg mb-4">Order Details</DialogTitle>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
											<div className="space-y-2 md:col-span-2">
												<div className="flex items-center justify-between mb-1">
													<Label className="font-semibold text-sm">Customer Selection *</Label>
													<RadioGroup 
														value={isWalkIn ? "walk-in" : "existing"}
														onValueChange={(val) => {
															setIsWalkIn(val === "walk-in");
															if (val === "existing") setCustomerId('');
														}} 
														className="flex gap-4 bg-muted/50 p-1 px-2 rounded-md border"
													>
														<div className="flex items-center space-x-1">
															<RadioGroupItem value="existing" id="existing-cust" />
															<Label htmlFor="existing-cust" className="text-[10px] uppercase font-bold cursor-pointer">Regular</Label>
														</div>
														<div className="flex items-center space-x-1">
															<RadioGroupItem value="walk-in" id="walk-in-cust" />
															<Label htmlFor="walk-in-cust" className="text-[10px] uppercase font-bold cursor-pointer text-blue-600">New/Walk-In</Label>
														</div>
													</RadioGroup>
												</div>

												{isWalkIn ? (
													<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
														<div className="space-y-1">
															<Label htmlFor="wiPhone" className="text-[10px] text-blue-700 font-bold uppercase">Mobile Number</Label>
															<Input 
																id="wiPhone" 
																placeholder="Type mobile..." 
																value={walkInPhone} 
																onChange={e => {
																	const val = e.target.value;
																	setWalkInPhone(val);
																	// Auto-search logic
																	if (val.length >= 10) {
																		const cleanVal = val.replace(/\D/g,'');
																		const existing = customers.find(c => c.phone?.replace(/\D/g,'').includes(cleanVal));
																		if (existing) {
																			setWalkInName(existing.name);
																			toast({ title: "Returning Customer", description: `Found: ${existing.name}` });
																		}
																	}
																}}
																className="bg-white border-blue-200 h-9"
															/>
														</div>
														<div className="space-y-1">
															<Label htmlFor="wiName" className="text-[10px] text-blue-700 font-bold uppercase">Customer Name *</Label>
														<Input 
															id="wiName" 
															placeholder="Enter Name" 
															value={walkInName} 
															onChange={e => setWalkInName(e.target.value)}
															className="bg-white border-blue-200 h-9"
														/>
													</div>
												</div>
											) : (
												<div className="flex gap-2">
													<div className="flex-1">
														<Combobox 
															options={customerOptions}
															value={customerId}
															onValueChange={setCustomerId}
															placeholder="Search existing customers..."
													/>
												</div>
												<Button type="button" variant="outline" onClick={() => setIsAddCustomerOpen(true)}>Add New</Button>
												</div>
											)}
										</div>

										<div className="space-y-2">
											<Label htmlFor="orderDate">Order Date</Label>
											<Input id="orderDate" type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
										</div>
									</div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {isFirstOrder && !isEditMode && (
                                                <div className="space-y-2">
                                                    <Label htmlFor="previous_balance">Opening Balance (Optional)</Label>
                                                    <Input id="previous_balance" type="number" placeholder="0.00" value={String(previousBalance)} onChange={e => setPreviousBalance(parseFloat(e.target.value) || 0)} />
                                                </div>
                                            )}
                                            {previousBalance > 0 && !isFirstOrder && (
                                                <div className="flex items-center justify-start">
                                                    <div className="text-right p-2 bg-amber-100 border border-amber-200 rounded-md">
                                                        <div className="text-sm font-medium text-amber-800">Previous Balance</div>
                                                        <div className="text-lg font-bold text-amber-900">{formatNumberForDisplay(previousBalance)}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        
                                        <Separator className="my-4" />
                                        
                                        <div className="space-y-4">
                                            <div className="flex items-center space-x-2">
                                                <Checkbox id="is_gst_invoice" checked={isGstInvoice} onCheckedChange={c => setIsGstInvoice(c as boolean)} />
                                                <Label htmlFor="is_gst_invoice">Generate GST Invoice?</Label>
                                            </div>
                                            
                                            <div className="space-y-2 pt-4">
												<Label className="font-bold">Payment Term</Label>
												<RadioGroup value={paymentTerm} onValueChange={(v) => setPaymentTerm(v as PaymentTerm)} className="flex gap-4">
													<div className="flex items-center space-x-2">
													<RadioGroupItem value="Full Payment" id="full_payment" />
													<Label htmlFor="full_payment">Full Payment</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="Part Payment" id="part_payment" />
													<Label htmlFor="part_payment" className="text-blue-600 font-semibold">Part Payment</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="Credit" id="credit" />
													<Label htmlFor="credit">Credit</Label>
												</div>
											</RadioGroup>
										</div>

										{/* NEW: Part Payment Amount Box */}
										{paymentTerm === 'Part Payment' && (
											<div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg animate-in fade-in zoom-in-95 duration-200">
												<Label htmlFor="part_amt" className="text-[10px] uppercase font-bold text-blue-700">Advance Amount Collected Now (₹)</Label>
												<Input 
													id="part_amt"
													type="number" 
													placeholder="e.g. 5000" 
													value={partPaymentAmount} 
													onChange={e => setPartPaymentAmount(e.target.value)}
													className="bg-white border-blue-300 h-10 text-lg font-semibold"
												/>
											</div>
										)}

										{/* Show Mode/Remarks for BOTH Full and Part Payments */}
										{(paymentTerm === 'Full Payment' || paymentTerm === 'Part Payment') && (
											<div className="grid grid-cols-2 gap-4 pt-2">
												<div className="space-y-2">
													<Label>Payment Mode</Label>
														<Select value={paymentMode} onValueChange={v => setPaymentMode(v as PaymentMode)}>
															<SelectTrigger><SelectValue /></SelectTrigger>
															<SelectContent>
																<SelectItem value="Cash">Cash</SelectItem>
																<SelectItem value="UPI">UPI</SelectItem>
																<SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
																<SelectItem value="Cheque">Cheque</SelectItem>
															</SelectContent>
														</Select>
													</div>
													<div className="space-y-2">
														<Label>Payment Remarks</Label>
														<Input 
															value={paymentRemarks} 
															onChange={e => setPaymentRemarks(e.target.value)} 
															placeholder="Reference info..."
														/>
													</div>
												</div>
											)}

											{paymentTerm === 'Credit' && (
												<div className="space-y-2 pt-2">
													<Label>Due Date</Label>
													<Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
												</div>
											)}

                                <Card>
                                    <CardContent className="p-4 space-y-4">
                                        <DialogTitle className="text-lg mb-4">Add Items</DialogTitle>
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                                            <div className="space-y-2 col-span-3">
                                                <Label>Item Name</Label>
                                                <Combobox options={productOptions} value={currentItem.productId} onValueChange={handleProductSelect} placeholder="Select an item" />
                                            </div>
                                            <div className="space-y-2 col-span-1">
                                                <Label>Stock</Label>
                                                <Input value={currentItem.stock} readOnly disabled />
                                            </div>
                                            <div className="space-y-2 col-span-2">
                                                <Label>{isWeightBased(currentItem.category) ? 'Qty (Nos)' : 'Qty'}</Label>
                                                <Input type="number" placeholder="0" value={currentItem.quantity} onChange={e => setCurrentItem({...currentItem, quantity: e.target.value})} />
                                            </div>
                                            <div className="space-y-2 col-span-2">
                                                <Label>Price</Label>
                                                <Input type="number" value={currentItem.price} onChange={e => setCurrentItem({...currentItem, price: e.target.value})} />
                                            </div>
                                            <div className="flex justify-end mt-4 col-span-4">
                                                <Button type="button" onClick={editingItemIndex !== null ? handleUpdateItem : handleAddItem}>
                                                    {editingItemIndex !== null ? 'Update Item' : 'Add Item'}
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardContent className="p-4">
                                        <DialogTitle className="text-lg mb-4">Order Items</DialogTitle>
                                        <div className="w-full overflow-x-auto rounded-md border">
                                            <Table className="min-w-[700px]">
                                                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Quantity</TableHead><TableHead>Price</TableHead><TableHead>Total</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                                                <TableBody>
                                                    {items.map((item, index) => (
                                                        <TableRow key={index}>
                                                            <TableCell>{products.find(p => p.id === item.productId)?.name}</TableCell>
                                                            <TableCell>{item.quantity}</TableCell>
                                                            <TableCell>{formatNumberForDisplay(parseFloat(item.price))}</TableCell>
                                                            <TableCell>{formatNumberForDisplay(parseFloat(item.price) * parseFloat(item.quantity))}</TableCell>
                                                            <TableCell className="space-x-2">
                                                                <Button type="button" size="sm" variant="outline" onClick={() => handleEditItemClick(index)}>Edit</Button>
                                                                <Button type="button" size="sm" variant="destructive" onClick={() => handleRemoveItem(index)}>Delete</Button>
																
																
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </CardContent>
                                </Card>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    
                                    {/* Delivery Details */}
                                    <Card>
                                        <CardContent className="p-4 space-y-4">
                                            <DialogTitle className="text-lg">Delivery Details</DialogTitle>
                                            <div className="space-y-2"><Label>Delivery Date</Label><Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} /></div>
                                <div className="space-y-2">
									<Label htmlFor="deliveryAddress">Delivery Address *</Label>
									<Textarea 
										id="deliveryAddress"
										value={deliveryAddress} 
										onChange={e => {
											console.log('🔍 DEBUG: Delivery address changing from', deliveryAddress, 'to', e.target.value);
											setDeliveryAddress(e.target.value);
										}}  
										placeholder="Enter delivery address (required)"
										required
										className={!deliveryAddress ? "border-red-500" : ""}
									/>
									{!deliveryAddress && (
										<p className="text-sm text-red-500">Delivery address is required</p>
									)}
								</div>
                                        </CardContent>
                                    </Card>

                                    {/* Order Summary Card */}
                                    <Card>
                                        <CardContent className="p-4 space-y-2">
                                            <DialogTitle className="text-lg mb-4">Order Summary</DialogTitle>
                                            <div className="flex justify-between text-sm">
                                                <span>Current Items Total:</span> 
                                                <span className="font-semibold">{formatNumberForDisplay(currentInvoiceTotal)}</span>
                                            </div>
                                             <div className="flex justify-between items-center text-sm">
                                                <Label htmlFor="delivery_fees" className="flex-1">Delivery Fees</Label>
                                                <Input type="number" placeholder="0.00" className="w-24 h-8" value={String(deliveryFees)} onChange={e => setDeliveryFees(parseFloat(e.target.value) || 0)} />
                                            </div>
                                             <div className="flex justify-between items-center text-sm">
                                                <div className="flex items-center space-x-2">
                                                    <Checkbox id="enable_discount" checked={enableDiscount} onCheckedChange={c => setEnableDiscount(c as boolean)} />
                                                    <Label htmlFor="enable_discount" className="flex-1">Discount</Label>
                                                </div>
                                                <Input type="number" placeholder="0.00" className="w-24 h-8" value={String(discount)} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} disabled={!enableDiscount} />
                                            </div>
                                            <Separator />
                                            <div className="flex justify-between text-sm">
                                                <span className="font-medium">Subtotal:</span>
                                                <span className="font-bold">{formatNumberForDisplay(subTotal)}</span>
                                            </div>
                                            {previousBalance > 0 && (
                                                <div className="flex justify-between text-destructive text-sm">
                                                    <span>Previous Balance:</span> 
                                                    <span className="font-semibold">{formatNumberForDisplay(previousBalance)}</span>
                                                </div>
                                            )}
                                            <Separator />
                                            <div className="flex justify-between text-lg">
                                                <span className="font-bold">Grand Total:</span>
                                                <span className="font-bold text-primary">{formatNumberForDisplay(grandTotal)}</span>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div> 
                        </form>
                    </ScrollArea>
                    <DialogFooter className="p-4 border-t">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
						</Button>
                        <Button type="submit">
                            {isEditMode ? 'Update Order' : 'Submit Order'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
		</>
    );
}		

            <Dialog open={isAddCustomerOpen} onOpenChange={setIsAddCustomerOpen}>
                <DialogContent aria-describedby={undefined}>
                    <DialogHeader><DialogTitle>Add New Customer</DialogTitle><DialogDescription>Fill in the details below to add a new customer.</DialogDescription></DialogHeader>
                    <form onSubmit={handleAddCustomerSubmit}>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="name" className="text-right">Name</Label><Input id="name" name="name" className="col-span-3" required /></div>
                            <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="phone" className="text-right">Phone</Label><Input id="phone" name="phone" className="col-span-3" /></div>
                            <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="address" className="text-right">Address</Label><Input id="address" name="address" className="col-span-3" /></div>
                            <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="gstin" className="text-right">GSTIN</Label><Input id="gstin" name="gstin" className="col-span-3" /></div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsAddCustomerOpen(false)}>Cancel</Button>
                            <Button type="submit">Save Customer</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}