
'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { Purchase, Supplier, Product, PurchaseItem, PaymentMode, PurchasePayment, PurchasePaymentTerm } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, Loader2, Edit, Trash2, MoreHorizontal, Receipt, ArrowUpDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { addPurchase, getProducts, addPaymentToPurchase, getPurchases } from '@/lib/data';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/ui/combobox';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

type SortKey = keyof Purchase | 'id' | 'supplierName' | 'purchaseDate' | 'balanceDue' | 'total';

const formatNumberForDisplay = (value: number | undefined) => {
    if (value === undefined || isNaN(value)) return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(0);
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', currencyDisplay: 'symbol' }).format(value);
};

export function PurchasesClient({ initialPurchases, initialSuppliers, initialProducts }: {
    initialPurchases: Purchase[],
    initialSuppliers: Supplier[],
    initialProducts: Product[]
}) {
    const [purchases, setPurchases] = useState<Purchase[]>(initialPurchases);
    const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [isLoading, setIsLoading] = useState(false);
    const [isAddPurchaseOpen, setIsAddPurchaseOpen] = useState(false);
    const [purchaseToEdit, setPurchaseToEdit] = useState<Purchase | null>(null);
    const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [isMounted, setIsMounted] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' } | null>(null);
    
    useEffect(() => {
        setIsMounted(true);
    }, []);

    const openPurchaseDialog = async () => {
        setIsLoading(true);
        try {
            const freshProducts = await getProducts();
            setProducts(freshProducts);
            setIsAddPurchaseOpen(true);
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

    const sortedPurchases = useMemo(() => {
        let sortableItems = [...purchases];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const key = sortConfig.key as keyof Purchase;
                const aValue = a[key];
                const bValue = b[key];
                
                // Handle null/undefined
                if (aValue === bValue) return 0;
                if (aValue === undefined || aValue === null) return 1;
                if (bValue === undefined || bValue === null) return -1;

                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [purchases, sortConfig]);

    const filteredPurchases = useMemo(() => {
        return sortedPurchases.filter(p => {
            const idMatch = (p.id || "").toLowerCase().includes(searchQuery.toLowerCase());
            const supplierMatch = (p.supplierName || "").toLowerCase().includes(searchQuery.toLowerCase());
            return idMatch || supplierMatch;
        }).sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
    }, [sortedPurchases, searchQuery]);

    const handleAddPurchase = async (newPurchaseData: Omit<Purchase, 'id' | 'supplierName'>) => {
       try {
           const newPurchase = await addPurchase(newPurchaseData);
           const allPurchases = await getPurchases();
           setPurchases(allPurchases);
           toast({
               title: "Purchase Recorded",
               description: `Purchase ${newPurchase.id} has been successfully created.`,
           });
       } catch (e: any) {
           toast({
              title: "Error Recording Purchase",
              description: e.message || "Failed to save the new purchase.",
              variant: "destructive"
          });
          throw e;
       }
    };
    
    const handleAddPaymentToPurchase = async (payment: Omit<PurchasePayment, 'id'>) => {
        if (!selectedPurchase) return;
        
        try {
            const updatedPurchase = await addPaymentToPurchase(selectedPurchase.id, payment);
            const allPurchases = await getPurchases();
            setPurchases(allPurchases);

            const newlyUpdatedPurchase = allPurchases.find(p => p.id === updatedPurchase.id);
            setSelectedPurchase(newlyUpdatedPurchase || null);
            
            toast({
                title: 'Payment Recorded',
                description: `Payment for purchase ${updatedPurchase.id} has been recorded.`,
            });
        } catch(e: any) {
            toast({
                title: 'Error',
                description: e.message || 'Failed to record payment.',
                variant: 'destructive'
            });
        }
    };

    if (!isMounted) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-10 w-48" />
                    <Skeleton className="h-10 w-32" />
                </div>
                <div className="rounded-lg border shadow-sm p-4">
                    <Skeleton className="h-8 w-full mb-4" />
                    <Skeleton className="h-8 w-full mb-2" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Purchases</h1>
                 <Button onClick={openPurchaseDialog} disabled={isLoading} className="transform hover:scale-105 transition-transform">
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                     Add Purchase
                </Button>
            </div>
            <Input 
                placeholder="Search by ID or Supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
            />
            <div className="rounded-lg border shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('id')}>Purchase ID <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('supplierName')}>Supplier <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('purchaseDate')}>Date <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right"><Button variant="ghost" onClick={() => requestSort('balanceDue')}>Balance Due <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead className="text-right"><Button variant="ghost" onClick={() => requestSort('total')}>Total <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredPurchases.map((purchase) => (
                            <TableRow key={purchase.id} onClick={() => setSelectedPurchase(purchase)} className="cursor-pointer transition-transform hover:-translate-y-px hover:shadow-md">
                                <TableCell className="font-medium">{purchase.id}</TableCell>
                                <TableCell>{purchase.supplierName}</TableCell>
                                <TableCell>{new Date(purchase.purchaseDate).toLocaleDateString('en-IN')}</TableCell>
                                <TableCell>
                                    <Badge variant={purchase.balanceDue <= 0 ? 'default' : 'secondary'}>
                                        {purchase.balanceDue <= 0 ? 'Paid' : 'Partial'}
                                    </Badge>
                                </TableCell>
                                <TableCell className={cn("text-right font-medium", purchase.balanceDue > 0 && "text-destructive")}>
                                    {formatNumberForDisplay(purchase.balanceDue)}
                                </TableCell>
                                <TableCell className="text-right">
                                    {formatNumberForDisplay(purchase.total)}
                                </TableCell>
                                <TableCell className="text-center">
                                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setSelectedPurchase(purchase); }}>
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            
            <AddPurchaseDialog
                isOpen={isAddPurchaseOpen || !!purchaseToEdit}
                onOpenChange={(open) => {
                    if (!open) {
                        setIsAddPurchaseOpen(false);
                        setPurchaseToEdit(null);
                    }
                }}
                suppliers={suppliers}
                products={products}
                onPurchaseAdded={handleAddPurchase}
                existingPurchase={purchaseToEdit}
            />
            
            <Sheet open={!!selectedPurchase && !isAddPurchaseOpen && !purchaseToEdit} onOpenChange={(open) => !open && setSelectedPurchase(null)}>
                <SheetContent className="sm:max-w-lg w-[90vw] flex flex-col">
                    {selectedPurchase && (
                        <>
                        <SheetHeader>
                            <SheetTitle>Purchase: {selectedPurchase.id}</SheetTitle>
                            <SheetDescription>
                                Manage payments for {selectedPurchase.supplierName}.
                            </SheetDescription>
                        </SheetHeader>
                        <div className="space-y-6 py-4 overflow-y-auto flex-1 pr-6">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Total Amount:</span>
                                <span>{formatNumberForDisplay(selectedPurchase.total)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-lg">
                                <span className="text-red-600">Balance Due:</span>
                                <span className="text-red-600">{formatNumberForDisplay(selectedPurchase.balanceDue)}</span>
                            </div>

                            <Separator />
                            
                            {selectedPurchase.balanceDue > 0 && (
                                <PaymentForm 
                                    balanceDue={selectedPurchase.balanceDue}
                                    onAddPayment={handleAddPaymentToPurchase} 
                                />
                            )}

                            <Separator />

                            <div className="space-y-2">
                               <h4 className="font-medium">Payment History</h4>
                                <div className="space-y-4 max-h-[40vh] overflow-y-auto p-1">
                                    {(selectedPurchase.payments && selectedPurchase.payments.length > 0) ? (
                                        selectedPurchase.payments.map(payment => (
                                             <div key={payment.id} className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded-lg">
                                                <div>
                                                    <p className="font-medium">{formatNumberForDisplay(payment.amount)}</p>
                                                    <p className="text-xs text-muted-foreground">{new Date(payment.paymentDate).toLocaleDateString('en-IN')} via {payment.method}</p>
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

        </div>
    );
}

const initialItemState = { productId: '', quantity: '', cost: '', gst: '' };
type PurchaseItemState = { productId: string, quantity: string, cost: string, gst: string };

function AddPurchaseDialog({ isOpen, onOpenChange, suppliers, products, onPurchaseAdded, existingPurchase }: {
    isOpen: boolean,
    onOpenChange: (open: boolean) => void,
    suppliers: Supplier[],
    products: Product[],
    onPurchaseAdded: (purchase: Omit<Purchase, 'id' | 'supplierName'>) => Promise<void>,
    existingPurchase: Purchase | null,
}) {
    const [supplierId, setSupplierId] = useState<string>('');
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<PurchaseItemState[]>([]);
    const [currentItem, setCurrentItem] = useState<PurchaseItemState>(initialItemState);
    const [paymentTerm, setPaymentTerm] = useState<PurchasePaymentTerm>('Paid');
    const [dueDate, setDueDate] = useState('');
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMode>('Cash');
    const [paymentNotes, setPaymentNotes] = useState('');
    const [isGstPurchase, setIsGstPurchase] = useState(true);
    
    const { toast } = useToast();
    const isEditMode = !!existingPurchase;

    const resetForm = useCallback(() => {
        setSupplierId('');
        setPurchaseDate(new Date().toISOString().split('T')[0]);
        setItems([]);
        setCurrentItem(initialItemState);
        setPaymentTerm('Paid');
        setDueDate('');
        setPaymentAmount('');
        setPaymentMethod('Cash');
        setPaymentNotes('');
        setIsGstPurchase(true);
        onOpenChange(false);
    }, [onOpenChange]);
    
    const handleProductSelect = (productId: string) => {
        const product = products.find(p => p.id === productId);
        if (product) {
            setCurrentItem({
                productId: product.id,
                quantity: '',
                cost: String(product.cost),
                gst: String(product.gst),
            });
        }
    };
    
    const handleAddItem = () => {
        if (!currentItem.productId || !currentItem.quantity || !currentItem.cost) {
            toast({ title: 'Error', description: 'Please fill out all item fields.', variant: 'destructive' });
            return;
        }
        setItems([...items, currentItem]);
        setCurrentItem(initialItemState);
    };
    
    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const { subTotal, totalGst, total } = useMemo(() => {
        const subTotal = items.reduce((sum, item) => sum + (parseFloat(item.cost) || 0) * (parseInt(item.quantity) || 0), 0);
        const totalGst = isGstPurchase
            ? items.reduce((sum, item) => sum + ((parseFloat(item.cost) || 0) * (parseInt(item.quantity) || 0) * ((parseFloat(item.gst) || 0) / 100)), 0)
            : 0;
        return { subTotal, totalGst, total: subTotal + totalGst };
    }, [items, isGstPurchase]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!supplierId || items.length === 0) {
            toast({
                title: "Validation Error",
                description: 'Please select a supplier and add at least one item.',
                variant: 'destructive'
            });
            return;
        }
        
        let paidAmount = 0;
        let payments: PurchasePayment[] = [];
        let balanceDue = total;

        if (paymentTerm === 'Paid') {
            paidAmount = parseFloat(paymentAmount) || 0;
            if (paidAmount > total) {
                toast({ title: "Error", description: 'Paid amount cannot be greater than the total purchase amount.', variant: 'destructive' });
                return;
            }
            if (paidAmount > 0) {
                payments.push({
                    id: 'temp-payment',
                    paymentDate: purchaseDate,
                    amount: paidAmount,
                    method: paymentMethod,
                    notes: paymentNotes
                });
            }
            balanceDue = total - paidAmount;
        }


        const purchaseData: Omit<Purchase, 'id' | 'supplierName'> = {
            supplierId,
            purchaseDate,
            items: items.map(item => {
                const product = products.find(p => p.id === item.productId);
                return {
                    productId: item.productId,
                    productName: product?.name || 'Unknown Item',
                    quantity: parseInt(item.quantity) || 0,
                    cost: parseFloat(item.cost) || 0,
                    gst: parseFloat(item.gst) || 0,
                };
            }),
            isGstPurchase,
            total,
            balanceDue,
            payments,
            paymentTerm,
            dueDate: paymentTerm === 'Credit' ? dueDate : undefined,
        };
        
        try {
            await onPurchaseAdded(purchaseData);
            resetForm();
        } catch (e) {
            // Error is handled by the parent component
        }
    };

    const supplierOptions = useMemo(() => suppliers.map(s => ({ value: s.id, label: s.name })), [suppliers]);
    const productOptions = useMemo(() => products
        .filter(p => p.name !== 'Outstanding Balance')
        .map(p => ({ value: p.id, label: `${p.name} (SKU: ${p.sku})` })), [products]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetForm(); else onOpenChange(open); }}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>{isEditMode ? `Edit Purchase ${existingPurchase.id}` : 'Add New Purchase'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <ScrollArea className="h-[70vh]">
                        <div className="space-y-4 p-4">
                            <Card>
                                <CardContent className="p-4 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Supplier</Label>
                                            <Combobox options={supplierOptions} value={supplierId} onValueChange={setSupplierId} placeholder="Select a supplier" searchPlaceholder="Search suppliers..." emptyPlaceholder="No supplier found." />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Purchase Date</Label>
                                            <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} required />
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2 pt-2">
                                        <Checkbox id="is_gst_purchase" checked={isGstPurchase} onCheckedChange={c => setIsGstPurchase(c as boolean)} />
                                        <Label htmlFor="is_gst_purchase">Is this a GST Purchase?</Label>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="p-4 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-10 gap-4 items-end">
                                        <div className="space-y-2 col-span-3">
                                            <Label>Item Name</Label>
                                            <Combobox options={productOptions} value={currentItem.productId} onValueChange={handleProductSelect} placeholder="Select an item" searchPlaceholder="Search items..." emptyPlaceholder="No item found." />
                                        </div>
                                        <div className="space-y-2 col-span-2">
                                            <Label>Quantity</Label>
                                            <Input type="number" placeholder="0" value={currentItem.quantity} onChange={e => setCurrentItem(s => ({ ...s, quantity: e.target.value }))} min="1" />
                                        </div>
                                        <div className="space-y-2 col-span-2">
                                            <Label>Cost Price/Unit</Label>
                                            <Input type="number" value={currentItem.cost} onChange={e => setCurrentItem(s => ({ ...s, cost: e.target.value }))} />
                                        </div>
                                        <div className="space-y-2 col-span-2">
                                            <Label>GST %</Label>
                                            <Input type="number" value={currentItem.gst} onChange={e => setCurrentItem(s => ({ ...s, gst: e.target.value }))} disabled={!isGstPurchase} />
                                        </div>
                                        <div className="col-span-1">
                                            <Button type="button" onClick={handleAddItem} className="w-full">Add</Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="p-4">
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Cost</TableHead><TableHead>GST</TableHead><TableHead>Total</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {items.map((item, index) => {
                                                const product = products.find(p => p.id === item.productId);
                                                const cost = parseFloat(item.cost) || 0;
                                                const quantity = parseInt(item.quantity) || 0;
                                                const gst = parseFloat(item.gst) || 0;
                                                const itemTotal = isGstPurchase ? cost * quantity * (1 + gst / 100) : cost * quantity;
                                                return (
                                                    <TableRow key={index}>
                                                        <TableCell>{product?.name}</TableCell>
                                                        <TableCell>{quantity}</TableCell>
                                                        <TableCell>{formatNumberForDisplay(cost)}</TableCell>
                                                        <TableCell>{isGstPurchase ? `${gst}%` : 'N/A'}</TableCell>
                                                        <TableCell>{formatNumberForDisplay(itemTotal)}</TableCell>
                                                        <TableCell><Button type="button" size="sm" variant="destructive" onClick={() => handleRemoveItem(index)}>Delete</Button></TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>

                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Card>
                                  <CardContent className="p-4 space-y-4">
                                      <DialogTitle className="text-lg mb-2">Payment Details</DialogTitle>
                                       <div className="space-y-2">
                                            <Label>Payment Term</Label>
                                            <RadioGroup value={paymentTerm} onValueChange={(v) => setPaymentTerm(v as PurchasePaymentTerm)} className="flex gap-4">
                                                <div className="flex items-center space-x-2"><RadioGroupItem value="Paid" id="paid" /><Label htmlFor="paid">Paid</Label></div>
                                                <div className="flex items-center space-x-2"><RadioGroupItem value="Credit" id="credit" /><Label htmlFor="credit">Credit</Label></div>
                                            </RadioGroup>
                                        </div>

                                       {paymentTerm === 'Paid' ? (
                                           <>
                                                <div className="space-y-2">
                                                    <Label>Amount Paid</Label>
                                                    <Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" max={total}/>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Payment Method</Label>
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
                                                <div className="space-y-2">
                                                    <Label>Notes</Label>
                                                    <Input value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="e.g. Transaction ID"/>
                                                </div>
                                           </>
                                       ) : (
                                            <div className="space-y-2">
                                                <Label>Due Date</Label>
                                                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                                            </div>
                                       )}
                                  </CardContent>
                                </Card>

                                <Card>
                                    <CardContent className="p-4 space-y-2">
                                        <DialogTitle className="text-lg">Summary</DialogTitle>
                                        <div className="flex justify-between"><span>Subtotal:</span> <span className="font-semibold">{formatNumberForDisplay(subTotal)}</span></div>
                                        {isGstPurchase && <div className="flex justify-between"><span>Total GST:</span> <span className="font-semibold">{formatNumberForDisplay(totalGst)}</span></div>}
                                        <Separator />
                                        <div className="flex justify-between text-lg">
                                            <span className="font-bold">Total Bill Value:</span>
                                            <span className="font-bold text-primary">{formatNumberForDisplay(total)}</span>
                                        </div>
                                         <div className="flex justify-between text-destructive">
                                            <span className="font-bold">Balance Due:</span>
                                            <span className="font-bold">{formatNumberForDisplay(total - (paymentTerm === 'Paid' ? parseFloat(paymentAmount) || 0 : 0))}</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </ScrollArea>
                    <DialogFooter className="p-4 border-t">
                        <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                        <Button type="submit">Record Purchase</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function PaymentForm({ balanceDue, onAddPayment }: { balanceDue: number; onAddPayment: (payment: Omit<PurchasePayment, 'id'>) => void }) {
    const [amount, setAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMode>('Cash');
    const [notes, setNotes] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const paymentAmount = parseFloat(amount);
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            alert('Please enter a valid amount.');
            return;
        }
        if (paymentAmount > balanceDue) {
            alert('Payment cannot be greater than the balance due.');
            return;
        }
        
        onAddPayment({
            amount: paymentAmount,
            paymentDate,
            method: paymentMethod,
            notes,
        });

        setAmount('');
        setNotes('');
    };

    return (
        <Card>
            <form onSubmit={handleSubmit}>
                <CardContent className="p-4 space-y-4">
                    <DialogTitle className="text-lg">Record a Payment</DialogTitle>
                    <div className="space-y-2">
                        <Label htmlFor="amount">Amount Paid</Label>
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
                        <Input id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Transaction ID" />
                    </div>
                     <Button type="submit" className="w-full">Record Payment</Button>
                </CardContent>
            </form>
        </Card>
    );
}