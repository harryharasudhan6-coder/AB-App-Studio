'use client';

import React, { useEffect, useState } from 'react';
import type { Product } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

type Props = {
  products?: Product[]; // server-passed initial data
};

type ProductForm = {
  id?: string;
  name: string;
  sku: string;
  category: string;
  calculationType: string;
  weightPerUnit: number;
  stock: number;
  salePrice: number;
  cost: number;
  gst: number;
};

const emptyForm = (): ProductForm => ({
  name: '',
  sku: '',
  category: 'Rods & Rings',
  calculationType: 'Per Kg',
  weightPerUnit: 0,
  stock: 0,
  salePrice: 0,
  cost: 0,
  gst: 0,
});

const getId = (p: any) => p?.id ?? p?._id ?? undefined;

export default function InventoryClient({ products: initialProducts = [] }: Props) {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [loading, setLoading] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm());

  // Keep local state in sync when server props change
  useEffect(() => {
    setProducts(initialProducts ?? []);
  }, [initialProducts]);

  const toNumber = (v: string | number) => (typeof v === 'number' ? v : v === '' ? 0 : Number(v));

  const setField = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const openAdd = () => {
    setForm(emptyForm());
    setIsAddOpen(true);
  };

  const openEdit = (p: Product) => {
    setForm({
      id: getId(p),
      name: p.name ?? '',
      sku: (p as any).sku ?? '',
      category: (p as any).category ?? 'Rods & Rings',
      calculationType: (p as any).calculationType ?? 'Per Kg',
      weightPerUnit: (p as any).weightPerUnit ?? 0,
      stock: (p as any).stock ?? 0,
      salePrice: (p as any).salePrice ?? 0,
      cost: (p as any).cost ?? 0,
      gst: (p as any).gst ?? 0,
    });
    setIsEditOpen(true);
  };

  // Create product (POST /api/products)
  const handleAddSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);

    try {
      const payload = {
        name: form.name,
        sku: form.sku,
        category: form.category,
        calculationType: form.calculationType,
        weightPerUnit: Number(form.weightPerUnit),
        stock: Number(form.stock),
        salePrice: Number(form.salePrice),
        cost: Number(form.cost),
        gst: Number(form.gst),
      };

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || 'Failed to create product');
      }

      const created: Product = await res.json();
      setProducts((prev) => [created, ...prev]);
      setIsAddOpen(false);

      toast({
        title: 'Product added',
        description: `${created.name} has been added to the inventory.`,
        variant: 'default',
      });
    } catch (err) {
      console.error('Add product error', err);
      toast({
        title: 'Error',
        description: 'Failed to add product. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Update product (PUT /api/products/:id)
  const handleEditSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!form.id) {
      toast({ title: 'Error', description: 'Missing product id for update.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: form.name,
        sku: form.sku,
        category: form.category,
        calculationType: form.calculationType,
        weightPerUnit: Number(form.weightPerUnit),
        stock: Number(form.stock),
        salePrice: Number(form.salePrice),
        cost: Number(form.cost),
        gst: Number(form.gst),
      };

      const res = await fetch(`/api/products/${form.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || 'Failed to update product');
      }

      const updated: Product = await res.json();
      setProducts((prev) => prev.map((p) => (getId(p) === getId(updated) ? updated : p)));
      setIsEditOpen(false);

      toast({
        title: 'Product updated',
        description: `${(updated as any).name ?? 'Product'} was updated.`,
        variant: 'default',
      });
    } catch (err) {
      console.error('Update product error', err);
      toast({
        title: 'Error',
        description: 'Failed to update product. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Delete product (DELETE /api/products/:id)
  const handleDelete = async (p: Product) => {
    const id = getId(p);
    if (!id) {
      toast({ title: 'Error', description: 'Cannot delete product without an id.', variant: 'destructive' });
      return;
    }

    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || 'Failed to delete product');
      }

      setProducts((prev) => prev.filter((item) => getId(item) !== id));
      toast({
        title: 'Deleted',
        description: `"${p.name}" removed from inventory.`,
        variant: 'default',
      });
    } catch (err) {
      console.error('Delete product error', err);
      toast({
        title: 'Error',
        description: 'Failed to delete product. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Products</h2>
        <div>
          <Button onClick={openAdd}>Add New Product</Button>
        </div>
      </div>

      <div>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" />
            Loading...
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="text-sm text-muted-foreground">
              <tr>
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">SKU</th>
                <th className="text-left py-2">Category</th>
                <th className="text-left py-2">Calc</th>
                <th className="text-right py-2">WPU</th>
                <th className="text-right py-2">Stock</th>
                <th className="text-right py-2">Sale</th>
                <th className="text-right py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                    No products found.
                  </td>
                </tr>
              )}

              {products.map((p, idx) => {
                const id = getId(p) ?? String(idx);
                return (
                  <tr key={id} className="border-t">
                    <td className="py-2">{p.name}</td>
                    <td className="py-2">{(p as any).sku ?? '—'}</td>
                    <td className="py-2">{(p as any).category ?? '—'}</td>
                    <td className="py-2">{(p as any).calculationType ?? '—'}</td>
                    <td className="py-2 text-right">{(p as any).weightPerUnit ?? 0}</td>
                    <td className="py-2 text-right">{(p as any).stock ?? 0}</td>
                    <td className="py-2 text-right">{(p as any).salePrice ?? 0}</td>
                    <td className="py-2 text-right space-x-2">
                      <Button size="sm" onClick={() => openEdit(p)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(p)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
            <DialogDescription>Fill the product details and save.</DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddSubmit();
            }}
            className="space-y-4"
          >
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setField('name', e.currentTarget.value)} required />
            </div>

            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => setField('sku', e.currentTarget.value)} />
            </div>

            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setField('category', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Rods & Rings">Rods & Rings</SelectItem>
                  <SelectItem value="Plates">Plates</SelectItem>
                  <SelectItem value="Sheets">Sheets</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Calculation Type</Label>
              <Select value={form.calculationType} onValueChange={(v) => setField('calculationType', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select calc type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Per Kg">Per Kg</SelectItem>
                  <SelectItem value="Per Unit">Per Unit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Weight Per Unit</Label>
              <Input
                type="number"
                value={String(form.weightPerUnit)}
                onChange={(e) => setField('weightPerUnit', toNumber(e.currentTarget.value))}
                step="any"
              />
            </div>

            <div>
              <Label>Stock</Label>
              <Input
                type="number"
                value={String(form.stock)}
                onChange={(e) => setField('stock', toNumber(e.currentTarget.value))}
              />
            </div>

            <div>
              <Label>Sale Price</Label>
              <Input
                type="number"
                value={String(form.salePrice)}
                onChange={(e) => setField('salePrice', toNumber(e.currentTarget.value))}
              />
            </div>

            <div>
              <Label>Cost</Label>
              <Input
                type="number"
                value={String(form.cost)}
                onChange={(e) => setField('cost', toNumber(e.currentTarget.value))}
              />
            </div>

            <div>
              <Label>GST (%)</Label>
              <Input
                type="number"
                value={String(form.gst)}
                onChange={(e) => setField('gst', toNumber(e.currentTarget.value))}
              />
            </div>

            <DialogFooter className="flex items-center justify-between">
              <div />
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Save'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>Modify product details and save.</DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleEditSubmit();
            }}
            className="space-y-4"
          >
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setField('name', e.currentTarget.value)} required />
            </div>

            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => setField('sku', e.currentTarget.value)} />
            </div>

            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setField('category', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Rods & Rings">Rods & Rings</SelectItem>
                  <SelectItem value="Plates">Plates</SelectItem>
                  <SelectItem value="Sheets">Sheets</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Calculation Type</Label>
              <Select value={form.calculationType} onValueChange={(v) => setField('calculationType', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select calc type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Per Kg">Per Kg</SelectItem>
                  <SelectItem value="Per Unit">Per Unit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Weight Per Unit</Label>
              <Input
                type="number"
                value={String(form.weightPerUnit)}
                onChange={(e) => setField('weightPerUnit', toNumber(e.currentTarget.value))}
                step="any"
              />
            </div>

            <div>
              <Label>Stock</Label>
              <Input
                type="number"
                value={String(form.stock)}
                onChange={(e) => setField('stock', toNumber(e.currentTarget.value))}
              />
            </div>

            <div>
              <Label>Sale Price</Label>
              <Input
                type="number"
                value={String(form.salePrice)}
                onChange={(e) => setField('salePrice', toNumber(e.currentTarget.value))}
              />
            </div>

            <div>
              <Label>Cost</Label>
              <Input
                type="number"
                value={String(form.cost)}
                onChange={(e) => setField('cost', toNumber(e.currentTarget.value))}
              />
            </div>

            <div>
              <Label>GST (%)</Label>
              <Input
                type="number"
                value={String(form.gst)}
                onChange={(e) => setField('gst', toNumber(e.currentTarget.value))}
              />
            </div>

            <DialogFooter className="flex items-center justify-between">
              <div />
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setIsEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Save'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}