'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, Trash2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { deleteOrder as deleteOrderFromDB, getCoreOrderData } from '@/lib/data';
import type { Order, Customer, Product } from '@/lib/types';

export function OrdersClient({ orders: initO, customers: initC, products: initP }: { orders: Order[], customers: Customer[], products: Product[] }) {
    const [orders, setOrders] = useState(initO);
    const [customers, setCustomers] = useState(initC);
    const [products, setProducts] = useState(initP);
    const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);
    const { toast } = useToast();

    const refreshData = async () => {
        const { orders: o, customers: c } = await getCoreOrderData();
        setOrders(o);
        setCustomers(c);
    };

    const handleDeleteOrder = async (id: string) => {
        if (!confirm("Are you sure?")) return;
        await deleteOrderFromDB(id);
        await refreshData();
        toast({ title: "Order Deleted" });
    };

    return (
        <div className="p-6 space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Orders</h1>
                <Button onClick={() => setIsAddOrderOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Place Order
                </Button>
            </div>

            <div className="rounded-md border bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Order ID</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Grand Total</TableHead>
                            <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.map((order) => (
                            <TableRow key={order.id}>
                                <TableCell className="font-medium">{order.id}</TableCell>
                                <TableCell>{order.customerName}</TableCell>
                                <TableCell>{new Date(order.orderDate).toLocaleDateString()}</TableCell>
                                <TableCell className="text-right">₹{order.grandTotal.toLocaleString()}</TableCell>
                                <TableCell className="text-center">
                                    <Button variant="ghost" className="text-red-500" onClick={() => handleDeleteOrder(order.id)}>
                                        Delete
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
			<AddOrderDialog 
                isOpen={isAddOrderOpen} 
                onOpenChange={setIsAddOrderOpen} 
                customers={customers} 
                products={products}
                onOrderAdded={async (data: any) => { 
                    console.log("Foundation Order Data:", data);
                    setIsAddOrderOpen(false);
                }}
            />
        </div>
    );
}

function AddOrderDialog({ isOpen, onOpenChange, customers, products, onOrderAdded }: any) {
    const [customerId, setCustomerId] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
    const { toast } = useToast();
	const [isWalkIn, setIsWalkIn] = useState(false);
	const [walkInName, setWalkInName] = useState('');
	const [walkInPhone, setWalkInPhone] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const payload = {
				customerId: isWalkIn ? 'walk-in' : customerId,
				customerName: isWalkIn ? `${walkInName} (Walk-In)` : (customers.find((c: any) => c.id === customerId)?.name || ''),
				orderDate,
				items: [],
				grandTotal: 0,
				status: 'Pending'
			};
			await onOrderAdded(payload);
			onOpenChange(false);
			toast({ title: "Order Created" });
		} catch (err) {
			toast({ title: "Error", variant: "destructive" });
		}
	};

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Quick Place Order</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-4">
							<div className="space-y-2">
								<Label>Customer Type</Label>
								<RadioGroup 
									value={isWalkIn ? 'wi' : 'reg'} 
									onValueChange={(v) => setIsWalkIn(v === 'wi')} 
									className="flex gap-4"
								>
									<div className="flex items-center space-x-2">
										<RadioGroupItem value="reg" id="reg" />
										<Label htmlFor="reg">Regular</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem value="wi" id="wi" />
										<Label htmlFor="wi">Walk-In</Label>
									</div>
								</RadioGroup>
							</div>

							{isWalkIn ? (
								<div className="space-y-2">
									<Label>Walk-In Name</Label>
									<Input 
										placeholder="Enter name" 
										value={walkInName} 
										onChange={e => setWalkInName(e.target.value)} 
									/>
								</div>
							) : (
								<div className="space-y-2">
									<Label>Select Regular Customer</Label>
									<Select value={customerId} onValueChange={setCustomerId}>
										<SelectTrigger>
											<SelectValue placeholder="Choose a customer" />
										</SelectTrigger>
										<SelectContent>
											{customers.map((c: any) => (
												<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}
						</div>
                        <div className="space-y-2">
                            <Label>Date</Label>
                            <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit">Save Foundation Order</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}