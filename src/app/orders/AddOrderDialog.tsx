'use client';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Order, Customer, Product, PaymentTerm, PaymentMode, CalculationType, ProductCategory, OrderItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableHead, TableRow, TableCell, TableHeader, TableBody } from '@/components/ui/table';
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/hooks/use-toast';
import { getCustomerBalance } from '@/lib/data';
import { formatNumberForDisplay } from '@/lib/utils'; // if you have this helper

// Categories that require weight-based pricing (price × weight instead of price × quantity)
const WEIGHT_BASED_CATEGORIES: string[] = ['Rods & Rings', 'Savukku Stick'];
const isWeightBased = (category: string) => WEIGHT_BASED_CATEGORIES.includes(category);

const initialItemState = {
    productId: '',
    quantity: '',
    price: '',
    cost: '',
    gst: '',
    stock: 0,
    calculationType: 'Per Unit' as CalculationType,
    category: 'General' as ProductCategory,
    weightPerUnit: 0,
    totalWeight: ''
};

type OrderItemState = {
    productId: string,
    quantity: string,
    price: string,
    cost: string,
    gst: string,
    stock: number,
    calculationType: CalculationType,
    category: ProductCategory,
    weightPerUnit: number,
    totalWeight: string
};

function AddOrderDialog({ isOpen, onOpenChange, customers, products, orders, onOrderAdded, onOrderUpdated, onCustomerAdded, existingOrder }: {
    isOpen: boolean,
    onOpenChange: (open: boolean) => void,
    customers: Customer[],
    products: Product[],
    orders: Order[],
    onOrderAdded: (order: Omit<Order, 'id' | 'customerName'>) => Promise<Order>,
    onOrderUpdated: (order: Order) => Promise<void>,
    onCustomerAdded: (customer: Omit<Customer, 'id' | 'transactionHistory' | 'orders'>) => Promise<Customer | null>,
    existingOrder: Order | null,
}) {
    const [customerId, setCustomerId] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<OrderItemState[]>([]);
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
            setCustomerId(existingOrder.customerId);
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
                    totalWeight: item.totalWeight ? String(item.totalWeight) : ''
                }
            }));
            setPaymentTerm(existingOrder.paymentTerm);
            if (existingOrder.paymentTerm === 'Full Payment' && existingOrder.payments && existingOrder.payments.length > 0) {
                setPaymentMode(existingOrder.payments[0].method || 'Cash');
                setPaymentRemarks(existingOrder.payments[0].notes || '');
            } else {
                setDueDate(existingOrder.dueDate ? new Date(existingOrder.dueDate).toISOString().split('T')[0] : '');
            }
            setDeliveryDate(existingOrder.deliveryDate ? new Date(existingOrder.deliveryDate).toISOString().split('T')[0] : '');
            setDeliveryAddress(existingOrder.deliveryAddress || '');
            setIsGstInvoice(existingOrder.isGstInvoice);
            setDiscount(existingOrder.discount);
            setEnableDiscount(existingOrder.discount > 0);
            setDeliveryFees(existingOrder.deliveryFees);
            setPreviousBalance(existingOrder.previousBalance);
        } else if (isOpen && !existingOrder) {
            // For new orders, always reset the form but keep dialog open
            setCustomerId('');
            setOrderDate(new Date().toISOString().split('T')[0]);
            setItems([]);
            setPaymentTerm('Full Payment');
            setPreviousBalance(0);
            setDiscount(0);
            setDeliveryFees(0);
            setEnableDiscount(false);
            setDeliveryAddress('');

        }
    }, [isOpen, existingOrder, products, isEditMode]);


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
            toast({ title: 'Stock Error', description: `Not enough stock for ${products.find(p => p.id === currentItem.productId)?.name}. Available: ${currentItem.stock}`, variant: 'destructive' });
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
            toast({ title: 'Stock Error', description: `Not enough stock for ${products.find(p => p.id === currentItem.productId)?.name}. Available: ${currentItem.stock}`, variant: 'destructive' });
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
                // Use manual totalWeight if set, otherwise calculate from quantity * weightPerUnit
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
                    // Use manual totalWeight if set, otherwise calculate from quantity * weightPerUnit
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
        if (!customerId) {
            toast({
                title: "Validation Error",
                description: 'Please select a customer.',
                variant: 'destructive'
            });
            return;
        }


        if (items.length === 0 && (!isFirstOrder || previousBalance <= 0)) {
            toast({
                title: "Validation Error",
                description: 'Please add at least one item to the order.',
                variant: 'destructive'
            });
            return;
        }

        const customer = customers.find(c => c.id === customerId);
        if (!customer) return;

        const isOpeningBalanceOrder = isFirstOrder && previousBalance > 0 && items.length === 0;

        let orderData: any = {
            id: isEditMode ? existingOrder.id : '',
            customerId,
            orderDate,
            customerName: customer.name,
            items: isOpeningBalanceOrder ? [{
                productId: 'OPENING_BALANCE',
                productName: 'Opening Balance',
                quantity: 1,
                price: previousBalance,
                cost: 0,
                gst: 0,
                calculationType: 'Per Unit',
                category: 'General',
            }] : items.map(item => {
                const product = products.find(p => p.id === item.productId);
                const priceValue = parseFloat(item.price) || 0;
                const qtyValue = parseFloat(item.quantity) || 0;
                const gstPercent = parseFloat(item.gst) || 0;

                const orderItem: Partial<OrderItem> = {
                    productId: item.productId,
                    productName: product?.name || 'Unknown',
                    quantity: qtyValue,
                    price: priceValue,
                    cost: parseFloat(item.cost) || 0,
                    gst: gstPercent,
                    calculationType: product?.calculationType,
                    category: product?.category,
                };

                if (product?.brand) orderItem.brand = product.brand;

                let itemSubtotal = 0;
                if (product && isWeightBased(product.category)) {
                    // Use manual totalWeight if set, otherwise calculate from quantity * weightPerUnit
                    const totalWeight = parseFloat(item.totalWeight) || (qtyValue * (product.weightPerUnit || 0));
                    orderItem.totalWeight = totalWeight;
                    itemSubtotal = priceValue * totalWeight;
                } else {
                    itemSubtotal = priceValue * qtyValue;
                }

                // Explicitly store the total for the item, including GST if applicable
                orderItem.total = isGstInvoice ? itemSubtotal * (1 + gstPercent / 100) : itemSubtotal;

                return orderItem;
            }),
            total: isOpeningBalanceOrder ? previousBalance : currentInvoiceTotal,
            previousBalance: isOpeningBalanceOrder ? 0 : previousBalance,
            discount,
            deliveryFees,
            grandTotal: isOpeningBalanceOrder ? previousBalance : grandTotal,
            paymentTerm,
            deliveryAddress: deliveryAddress || customer.address,
            isGstInvoice,
            isOpeningBalance: isOpeningBalanceOrder,
        };

        if (deliveryDate) {
            orderData.deliveryDate = deliveryDate;
        }

        if (paymentTerm === 'Credit') {
            orderData.payments = isEditMode ? existingOrder.payments : [];
            orderData.balanceDue = orderData.grandTotal;
            orderData.status = 'Pending';
            if (dueDate) {
                orderData.dueDate = dueDate;
            }
        } else { // Full Payment
            orderData.payments = [{
                id: 'temp-payment-id',
                paymentDate: orderDate,
                amount: orderData.grandTotal,
                method: paymentMode,
                notes: paymentRemarks,
            }];
            orderData.balanceDue = 0;
            orderData.status = 'Fulfilled';
        }

        if (isEditMode) {
            try {
                await onOrderUpdated(orderData as Order);
                resetForm();
            } catch (e) {
                // error is toasted in parent
            }
        } else {
            try {
                await onOrderAdded(orderData as Omit<Order, 'id' | 'customerName'>);
                resetForm();
            } catch (e) {
                // Error is already toasted in the parent component
            }
        }
    };

    const customerOptions = useMemo(() => customers.map(c => ({ value: c.id, label: c.name })), [customers]);
    const productOptions = useMemo(() => {
        return products.filter(p => p.name !== 'Outstanding Balance').map(p => ({ value: p.id, label: `${p.name} (SKU: ${p.sku})` }));
    }, [products]);


    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetForm(); else onOpenChange(open); }}>
                <DialogContent className="max-w-6xl" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>{isEditMode ? `Edit Order ${existingOrder.id}` : 'Place New Order'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit}>
                        <ScrollArea className="h-[70vh]">
                            <div className="space-y-4 p-4">
                                <Card>
                                    <CardContent className="p-4 space-y-4 rounded-lg">
                                        <DialogTitle className="text-lg mb-4">Order Details</DialogTitle>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="space-y-2 md:col-span-2">
                                                <Label htmlFor="customer">Customer Name</Label>
                                                <div className="flex gap-2">
                                                    <Combobox
                                                        options={customerOptions}
                                                        value={customerId}
                                                        onValueChange={setCustomerId}
                                                        placeholder="Select a customer"
                                                        searchPlaceholder="Search customers..."
                                                        emptyPlaceholder="No customer found."
                                                    />
                                                    <Button type="button" variant="outline" onClick={() => setIsAddCustomerOpen(true)}>Add New</Button>
                                                </div>
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
                                                <Label>Payment Term</Label>
                                                <RadioGroup value={paymentTerm} onValueChange={(v) => setPaymentTerm(v as PaymentTerm)} className="flex gap-4">
                                                    <div className="flex items-center space-x-2"><RadioGroupItem value="Full Payment" id="full_payment" /><Label htmlFor="full_payment">Full Payment</Label></div>
                                                    <div className="flex items-center space-x-2"><RadioGroupItem value="Credit" id="credit" /><Label htmlFor="credit">Credit</Label></div>
                                                </RadioGroup>
                                            </div>
                                            {paymentTerm === 'Full Payment' && (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label>Payment Mode</Label>
                                                        <Select value={paymentMode} onValueChange={v => setPaymentMode(v as PaymentMode)}>
                                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                                            <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Card">Card</SelectItem><SelectItem value="UPI">UPI</SelectItem><SelectItem value="Cheque">Cheque</SelectItem><SelectItem value="Online Transfer">Online Transfer</SelectItem></SelectContent>
                                                        </Select>
                                                    </div>
                                                    {(paymentMode === 'Card' || paymentMode === 'Cheque') && (
                                                        <div className="space-y-2">
                                                            <Label>Payment Remarks</Label>
                                                            <Input value={paymentRemarks} onChange={e => setPaymentRemarks(e.target.value)} placeholder="Enter card/cheque details" />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {paymentTerm === 'Credit' && (
                                                <div className="space-y-2">
                                                    <Label>Due Date</Label>
                                                    <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardContent className="p-4 space-y-4">
                                        <DialogTitle className="text-lg mb-4">Add Items</DialogTitle>
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                                            <div className="space-y-2 col-span-3">
                                                <Label>Item Name</Label>
                                                <Combobox
                                                    options={productOptions}
                                                    value={currentItem.productId}
                                                    onValueChange={handleProductSelect}
                                                    placeholder="Select an item"
                                                    searchPlaceholder="Search items..."
                                                    emptyPlaceholder="No item found."
                                                />
                                            </div>
                                            <div className="space-y-2 col-span-1">
                                                <Label>Stock</Label>
                                                <Input value={currentItem.stock} readOnly disabled />
                                            </div>
                                            <div className="space-y-2 col-span-2">
                                                <Label>{isWeightBased(currentItem.category) ? 'Quantity (Nos)' : 'Quantity'}</Label>
                                                <Input
                                                    type="number"
                                                    placeholder="0"
                                                    value={currentItem.quantity}
                                                    onChange={e => {
                                                        const newQuantity = e.target.value;
                                                        if (isWeightBased(currentItem.category)) {
                                                            // Auto-calculate totalWeight when quantity changes
                                                            const calculatedWeight = (parseFloat(newQuantity) || 0) * currentItem.weightPerUnit;
                                                            setCurrentItem(s => ({ ...s, quantity: newQuantity, totalWeight: calculatedWeight.toFixed(2) }));
                                                        } else {
                                                            setCurrentItem(s => ({ ...s, quantity: newQuantity }));
                                                        }
                                                    }}
                                                    min="0"
                                                    step="any"
                                                />
                                            </div>
                                            {isWeightBased(currentItem.category) && (
                                                <div className="space-y-2 col-span-2">
                                                    <Label>Total Weight (Kg)</Label>
                                                    <Input
                                                        type="number"
                                                        value={currentItem.totalWeight}
                                                        onChange={e => setCurrentItem(s => ({ ...s, totalWeight: e.target.value }))}
                                                        placeholder="0.00"
                                                        step="0.01"
                                                    />
                                                </div>
                                            )}
                                            <div className="space-y-2 col-span-2">
                                                <Label>Sale Price {currentItem.calculationType === 'Per Kg' && '(per Kg)'}</Label>
                                                <Input type="number" value={currentItem.price} onChange={e => setCurrentItem(s => ({ ...s, price: e.target.value }))} />
                                            </div>
                                            <div className="flex justify-end mt-4 col-span-2">
                                                {editingItemIndex !== null ? (
                                                    <Button type="button" onClick={handleUpdateItem}>Update Item</Button>
                                                ) : (
                                                    <Button type="button" onClick={handleAddItem}>Add Item</Button>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>


                                {/* Items Table */}
                                <Card>
                                    <CardContent className="p-4">
                                        <DialogTitle className="text-lg mb-4">Order Items</DialogTitle>
                                        <Table>
                                            <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Quantity</TableHead><TableHead>Total Wt.</TableHead><TableHead>Price</TableHead><TableHead>GST</TableHead><TableHead>Total</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {items.map((item, index) => {
                                                    const product = products.find(p => p.id === item.productId);
                                                    const price = parseFloat(item.price) || 0;
                                                    const quantity = parseFloat(item.quantity) || 0;
                                                    const gst = parseFloat(item.gst) || 0;

                                                    const totalWeight = isWeightBased(item.category)
                                                        ? (parseFloat(item.totalWeight) || (quantity * (item.weightPerUnit || 0)))
                                                        : 0;
                                                    const priceBase = isWeightBased(item.category) ? totalWeight : quantity;

                                                    const itemSubTotal = price * priceBase;

                                                    const itemTotal = isGstInvoice
                                                        ? itemSubTotal * (1 + gst / 100)
                                                        : itemSubTotal;

                                                    let productName = product?.name || 'Unknown';
                                                    if (product?.brand) productName += ` (${product.brand})`;

                                                    return (
                                                        <TableRow key={index}>
                                                            <TableCell>{productName}</TableCell>
                                                            <TableCell>{quantity} {isWeightBased(item.category) ? 'nos' : (item.calculationType === 'Per Kg' ? 'kg' : '')}</TableCell>
                                                            <TableCell>{isWeightBased(item.category) ? `${totalWeight.toFixed(2)} kg` : 'N/A'}</TableCell>
                                                            <TableCell>{formatNumberForDisplay(price)}{item.calculationType === 'Per Kg' ? '/kg' : ''}</TableCell>
                                                            <TableCell>{isGstInvoice ? `${item.gst}%` : 'N/A'}</TableCell>
                                                            <TableCell>{formatNumberForDisplay(itemTotal)}</TableCell>
                                                            <TableCell className="space-x-2">
                                                                <Button type="button" size="sm" variant="outline" onClick={() => handleEditItemClick(index)}>Edit</Button>
                                                                <Button type="button" size="sm" variant="destructive" onClick={() => handleRemoveItem(index)}>Delete</Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
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

                                    {/* Order Summary */}
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
                        </ScrollArea>
                        <DialogFooter className="p-4 border-t">
                            <Button type="button" variant="outline" onClick={() => resetForm()}>Cancel</Button>
                            <Button type="submit">{isEditMode ? 'Update Order' : 'Submit Order'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

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

export { AddOrderDialog };