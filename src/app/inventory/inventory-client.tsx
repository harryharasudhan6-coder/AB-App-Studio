'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Product, CalculationType, ProductCategory } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PlusCircle, MoreHorizontal, AlertTriangle, Database, Edit, Trash2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { addProduct, deleteProduct as deleteProductFromDB, getProducts, updateProduct, getOrders, getInvoices, getCustomers, getSuppliers, getPurchases } from '@/lib/data';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

// Helper for formatting numbers
const formatNumber = (num: number | undefined) => num !== undefined ? num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

// Props interface for the main component
interface InventoryClientProps {
  products: Product[];
}

// --- AddProductDialog Component (Unchanged: Keeps Cost Price for Internal Use)
interface AddProductDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onProductAdded: (product: Product) => void;
}

const AddProductDialog: React.FC<AddProductDialogProps> = ({ isOpen, onOpenChange, onProductAdded }) => {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const [stock, setStock] = useState(0);
  const [salePrice, setSalePrice] = useState(0);
  const [costPrice, setCostPrice] = useState(0);
  const [gst, setGst] = useState(0);
  const [reorderPoint, setReorderPoint] = useState(0);
  const [calculationType, setCalculationType] = useState<CalculationType>('Per Unit');
  const [weightPerUnit, setWeightPerUnit] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !sku || !category || stock < 0 || salePrice < 0 || costPrice < 0 || gst < 0) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields (Name, SKU, Category, Stock, Sale Price, Cost Price) correctly. Values must be non-negative.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const newProduct: Omit<Product, 'id'> = {
        name,
        sku,
        category: category as ProductCategory,
        stock,
        salePrice,
        costPrice,
        cost: costPrice,
        gst,
        reorderPoint,
        calculationType,
        ...(category === 'Rods & Rings' || category === 'Savukku Stick') && { weightPerUnit },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const addedProduct = await addProduct(newProduct);
      onProductAdded(addedProduct);
      onOpenChange(false);
      toast({
        title: "Success",
        description: `${name} has been added to the inventory.`,
      });

      // Reset form
      setName('');
      setSku('');
      setCategory('');
      setStock(0);
      setSalePrice(0);
      setCostPrice(0);
      setGst(0);
      setReorderPoint(0);
      setCalculationType('Per Unit');
      setWeightPerUnit(0);

    } catch (error) {
      console.error('Failed to add product:', error);
      toast({
        title: "Error",
        description: "Failed to add product. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
          <DialogDescription>
            Fill in the details below to add a new product to the inventory.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">Name*</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sku" className="text-right">SKU*</Label>
              <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="category" className="text-right">Category*</Label>
              <Select onValueChange={(value: ProductCategory) => setCategory(value)} value={category} required>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="General">General</SelectItem>
                  <SelectItem value="Red Bricks">Red Bricks</SelectItem>
                  <SelectItem value="Rods & Rings">Rods & Rings</SelectItem>
                  <SelectItem value="Savukku Stick">Savukku Stick</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="stock" className="text-right">Stock*</Label>
              <Input
                id="stock"
                type="number"
                value={stock}
                onChange={(e) => setStock(parseInt(e.target.value) || 0)}
                className="col-span-3"
                min="0"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="salePrice" className="text-right">Sale Price*</Label>
              <Input
                id="salePrice"
                type="number"
                value={salePrice}
                onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
                className="col-span-3"
                step="0.01"
                min="0"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="costPrice" className="text-right">Cost Price</Label>
              <Input
                id="costPrice"
                type="number"
                value={costPrice}
                onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                className="col-span-3"
                step="0.01"
                min="0"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="gst" className="text-right">GST%*</Label>
              <Input
                id="gst"
                type="number"
                value={gst}
                onChange={(e) => setGst(parseFloat(e.target.value) || 0)}
                className="col-span-3"
                step="0.01"
                min="0"
                max="100"
                placeholder="e.g., 18"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="reorderPoint" className="text-right">Reorder Point</Label>
              <Input
                id="reorderPoint"
                name="reorderPoint"
                type="number"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(parseInt(e.target.value) || 0)}
                className="col-span-3"
                min="0"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="type" className="text-right">Calculation Type</Label>
              <Select onValueChange={(value: CalculationType) => setCalculationType(value)} value={calculationType}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Per Pc">Per Pc</SelectItem>
                  <SelectItem value="Per Kg">Per Kg</SelectItem>
                  <SelectItem value="Per Load">Per Load</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(category === 'Rods & Rings' || category === 'Savukku Stick') && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="weightPerUnit" className="text-right">Weight/Unit (Kg)</Label>
                <Input
                  id="weightPerUnit"
                  type="number"
                  value={weightPerUnit}
                  onChange={(e) => setWeightPerUnit(parseFloat(e.target.value) || 0)}
                  className="col-span-3"
                  step="0.01"
                  min="0"
                  placeholder="e.g., 10.69"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Product
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// --- EditProductDialog Component (Unchanged: Keeps Cost Price for Internal Use)
interface EditProductDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  productToEdit: Product | null;
  handleEditSubmit: (updatedProduct: Product) => void;
}

const EditProductDialog: React.FC<EditProductDialogProps> = ({ isOpen, onOpenChange, productToEdit, handleEditSubmit }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [editData, setEditData] = useState<Partial<Product>>({});

  useEffect(() => {
    if (productToEdit) {
      setEditData({
        id: productToEdit.id,
        name: productToEdit.name,
        sku: productToEdit.sku,
        category: productToEdit.category,
        stock: productToEdit.stock,
        salePrice: productToEdit.salePrice || 0,
        costPrice: productToEdit.costPrice || 0,
        gst: productToEdit.gst || 0,
        reorderPoint: productToEdit.reorderPoint || 0,
        calculationType: productToEdit.calculationType || 'Per Unit',
        weightPerUnit: productToEdit.weightPerUnit || 0,
      });
    } else {
      setEditData({});
    }
  }, [productToEdit]);

  const handleChange = (field: keyof Product, value: string | number | ProductCategory | CalculationType | undefined) => {
    setEditData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productToEdit) return;

    if (!editData.name || !editData.sku || !editData.category || editData.stock === undefined || editData.salePrice === undefined || editData.costPrice === undefined || editData.gst === undefined || editData.stock < 0 || editData.salePrice < 0 || editData.costPrice < 0 || editData.gst < 0) {
      toast({
        title: "Validation Error",
        description: "Required fields must be filled and non-negative.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const safeTrim = (value: any): string => {
        if (typeof value === 'string' && value !== null && value !== undefined) {
          return value.trim();
        }
        return '';
      };

      const updates: Partial<Product> = {
        name: safeTrim(editData.name),
        sku: safeTrim(editData.sku),
        category: safeTrim(editData.category as string) as ProductCategory,
        stock: editData.stock ?? 0,
        salePrice: editData.salePrice ?? 0,
        costPrice: editData.costPrice ?? 0,
        gst: editData.gst ?? 0,
        reorderPoint: editData.reorderPoint ?? 0,
        calculationType: editData.calculationType || 'Per Unit',
        updatedAt: new Date().toISOString(),
        ...(( editData.category === 'Rods & Rings' || editData.category === 'Savukku Stick') && { weightPerUnit: editData.weightPerUnit ?? 0 }),
      };

      const updatedProduct: Product = {
        ...productToEdit,
        ...updates,
      } as Product;

      console.log('Updating product:', { id: updatedProduct.id, updates });

      await updateProduct(updatedProduct.id, updates);

      handleEditSubmit(updatedProduct);
      onOpenChange(false);

      toast({
        title: "Success",
        description: `${updatedProduct.name} has been updated.`,
      });
    } catch (error) {
      console.error('Failed to update product:', error);
      toast({
        title: "Error",
        description: "Failed to update product. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!productToEdit) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Product: {productToEdit.name}</DialogTitle>
          <DialogDescription>
            Make changes to the product details here.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right">Name*</Label>
              <Input
                id="edit-name"
                value={editData.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                className="col-span-3"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-sku" className="text-right">SKU*</Label>
              <Input
                id="edit-sku"
                value={editData.sku || ''}
                onChange={(e) => handleChange('sku', e.target.value)}
                className="col-span-3"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-category" className="text-right">Category*</Label>
              <Select
                onValueChange={(value: ProductCategory) => handleChange('category', value)}
                value={editData.category as ProductCategory || ''}
                required
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="General">General</SelectItem>
                  <SelectItem value="Red Bricks">Red Bricks</SelectItem>
                  <SelectItem value="Rods & Rings">Rods & Rings</SelectItem>
                  <SelectItem value="Savukku Stick">Savukku Stick</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-stock" className="text-right">Stock*</Label>
              <Input
                id="edit-stock"
                type="number"
                value={editData.stock || 0}
                onChange={(e) => handleChange('stock', parseInt(e.target.value) || 0)}
                className="col-span-3"
                min="0"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-salePrice" className="text-right">Sale Price*</Label>
              <Input
                id="edit-salePrice"
                type="number"
                value={editData.salePrice || 0}
                onChange={(e) => handleChange('salePrice', parseFloat(e.target.value) || 0)}
                className="col-span-3"
                step="0.01"
                min="0"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-costPrice" className="text-right">Cost Price</Label>
              <Input
                id="edit-costPrice"
                type="number"
                value={editData.costPrice || 0}
                onChange={(e) => handleChange('costPrice', parseFloat(e.target.value) || 0)}
                className="col-span-3"
                step="0.01"
                min="0"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-gst" className="text-right">GST%*</Label>
              <Input
                id="edit-gst"
                type="number"
                value={editData.gst || 0}
                onChange={(e) => handleChange('gst', parseFloat(e.target.value) || 0)}
                className="col-span-3"
                step="0.01"
                min="0"
                max="100"
                placeholder="e.g., 18"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-reorderPoint" className="text-right">Reorder Point</Label>
              <Input
                id="edit-reorderPoint"
                name="reorderPoint"
                type="number"
                value={editData.reorderPoint || 0}
                onChange={(e) => handleChange('reorderPoint', parseInt(e.target.value) || 0)}
                className="col-span-3"
                min="0"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-type" className="text-right">Calculation Type</Label>
              <Select
                onValueChange={(value: CalculationType) => handleChange('calculationType', value)}
                value={editData.calculationType || 'Per Unit'}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Per Pc">Per Pc</SelectItem>
                  <SelectItem value="Per Kg">Per Kg</SelectItem>
                  <SelectItem value="Per Load">Per Load</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(editData.category === 'Rods & Rings' || editData.category === 'Savukku Stick') && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-weightPerUnit" className="text-right">Weight/Unit (Kg)</Label>
                <Input
                  id="edit-weightPerUnit"
                  type="number"
                  value={editData.weightPerUnit || 0}
                  onChange={(e) => handleChange('weightPerUnit', parseFloat(e.target.value) || 0)}
                  className="col-span-3"
                  step="0.01"
                  min="0"
                  placeholder="e.g., 10.69"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// --- Main InventoryClient Component (Updated: Hide Cost Price in Table/Mobile)
const InventoryClient: React.FC<InventoryClientProps> = ({ products: initialProducts }) => {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [loading, setLoading] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<ProductCategory | 'all'>('all');
  const [firebaseStatus, setFirebaseStatus] = useState({ connected: true, message: "" });
  const { toast } = useToast();

  // TEMP TEST FOR STEP 2: Enhanced errors
  useEffect(() => {
    console.log('🧪 Step 2: Starting fetch tests...');

    // Products (likely error here)
    getProducts().then((products) => {
      console.log('✅ Fetched Products:', products.length, 'items. First one:', products[0] || 'Empty');
    }).catch((error) => {
      console.error('❌ Products fetch error - Full details:', {
        message: error.message || 'No message',
        code: error.code || 'Unknown',
        name: error.name || 'Unknown',
        stack: error.stack ? error.stack.substring(0, 200) + '...' : 'No stack'
      });
    });

    // Orders (likely error here)
    getOrders().then((orders) => {
      console.log('✅ Fetched Orders:', orders.length, 'items. First one:', orders[0] || 'Empty');
    }).catch((error) => {
      console.error('❌ Orders fetch error - Full details:', {
        message: error.message || 'No message',
        code: error.code || 'Unknown',
        name: error.name || 'Unknown',
        stack: error.stack ? error.stack.substring(0, 200) + '...' : 'No stack'
      });
    });

    // Invoices (likely error here, since based on orders)
    getInvoices().then((invoices) => {
      console.log('✅ Fetched Invoices:', invoices.length, 'items. First one:', invoices[0] || 'Empty');
    }).catch((error) => {
      console.error('❌ Invoices fetch error - Full details:', {
        message: error.message || 'No message',
        code: error.code || 'Unknown',
        name: error.name || 'Unknown',
        stack: error.stack ? error.stack.substring(0, 200) + '...' : 'No stack'
      });
    });

    // Customers (already working - keep simple)
    getCustomers().then((customers) => {
      console.log('✅ Fetched Customers:', customers.length, 'items. First one:', customers[0] || 'Empty');
    }).catch((error) => {
      console.error('❌ Customers fetch error:', error);
    });

    // Suppliers (already working)
    getSuppliers().then((suppliers) => {
      console.log('✅ Fetched Suppliers:', suppliers.length, 'items. First one:', suppliers[0] || 'Empty');
    }).catch((error) => {
      console.error('❌ Suppliers fetch error:', error);
    });

    // Purchases (already working)
    getPurchases().then((purchases) => {
      console.log('✅ Fetched Purchases:', purchases.length, 'items. First one:', purchases[0] || 'Empty');
    }).catch((error) => {
      console.error('❌ Purchases fetch error:', error);
    });

    console.log('🧪 Step 2: Fetch tests complete.');
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const fetchedProducts = await getProducts();
      setProducts(fetchedProducts);
      setFirebaseStatus({ connected: true, message: "" });
      toast({
        title: "Success",
        description: "Products refreshed.",
      });
    } catch (error) {
      console.error("Failed to fetch products:", error);
      setFirebaseStatus({ connected: false, message: "Failed to connect to the database. Displaying cached data." });
      toast({
        title: "Connection Error",
        description: "Failed to load real-time data. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleProductAdded = useCallback((newProduct: Product) => {
    setProducts(prev => [newProduct, ...prev]);
    toast({
      title: "Success",
      description: `${newProduct.name} has been added to the inventory.`,
    });
  }, [toast]);

  const handleEditProduct = useCallback((updatedProduct: Product) => {
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    setProductToEdit(null);
    toast({
      title: "Success",
      description: `${updatedProduct.name} has been updated.`,
    });
  }, [toast]);

  const handleDeleteProduct = async () => {
    if (!productToDelete || !productToDelete.id) return;

    try {
      await deleteProductFromDB(productToDelete.id);
      setProducts(prev => prev.filter(p => p.id !== productToDelete.id));
      toast({
        title: "Success",
        description: `${productToDelete.name} has been deleted.`,
      });
      setProductToDelete(null);
    } catch (error) {
      console.error('Failed to delete product:', error);
      toast({
        title: "Error",
        description: "Failed to delete product. Please try again.",
        variant: "destructive",
      });
    }
  };

  const filteredProducts = useMemo(() => {
    console.log('🔍 Filter DEBUG: Starting with raw products:', products.length, 'Names:', products.map(p => p.name).join(', '));  // TEMP

    let filtered = products;

    // Category filter
    if (filterCategory !== 'all') {
      filtered = filtered.filter(product =>
        (product.category || '').toLowerCase() === filterCategory.toLowerCase()
      );
      console.log('🔍 After Category Filter (', filterCategory, '):', filtered.length);  // TEMP
    }

    // Search filter
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(product =>
        product.name?.toLowerCase().includes(lowerSearch) ||
        product.sku?.toLowerCase().includes(lowerSearch) ||
        product.category?.toLowerCase().includes(lowerSearch)
      );
      console.log('🔍 After Search Filter (', searchTerm, '):', filtered.length);  // TEMP
    }

    console.log('🔍 Filter DEBUG: Final filtered:', filtered.length, 'Names:', filtered.map(p => p.name).join(', '));  // TEMP

    return filtered.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;  // Newest first
    });
  }, [products, filterCategory, searchTerm]);


  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Database className="h-6 w-6 text-primary" /> Inventory Overview
                </CardTitle>
                <CardDescription>
                  Manage your stock, prices, and product details. Total products: {products.length}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setIsAddDialogOpen(true)}
                  className="flex items-center gap-2"
                  disabled={!firebaseStatus.connected}
                >
                  <PlusCircle className="h-5 w-5" /> Add New Product
                </Button>
                <Button
                  variant="outline"
                  onClick={fetchProducts}
                  disabled={loading || !firebaseStatus.connected}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    'Refresh'
                  )}
                </Button>
              </div>
            </div>

            {!firebaseStatus.connected && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Database Disconnected</AlertTitle>
                <AlertDescription>{firebaseStatus.message}</AlertDescription>
              </Alert>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <Input
                placeholder="Search by name, SKU, or brand..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
              <Select onValueChange={(value) => setFilterCategory(value as ProductCategory | 'all')} value={filterCategory}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                  <SelectItem value="Red Bricks">Red Bricks</SelectItem>
                  <SelectItem value="Rods & Rings">Rods & Rings</SelectItem>
                  <SelectItem value="Savukku Stick">Savukku Stick</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Desktop Table View (Removed Cost Price Column) */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Product Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="text-right">Sale Price</TableHead>
                    <TableHead className="text-right">GST%</TableHead>
                    <TableHead className="w-[50px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={7}><Skeleton className="h-4 w-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : (
                    filteredProducts.map((product) => {
                      const isLowStock = product.reorderPoint !== undefined && product.stock <= product.reorderPoint;
                      return (
                        <TableRow key={product.id} className="transition-transform hover:-translate-y-px hover:shadow-md">
                          <TableCell className="font-medium">
                            {product.name}
                            {product.brand && <span className="text-muted-foreground text-xs">({product.brand})</span>}
                          </TableCell>
                          <TableCell>{product.sku}</TableCell>
                          <TableCell><Badge variant="secondary">{product.category || 'General'}</Badge></TableCell>
                          <TableCell className={cn(isLowStock && "text-destructive font-bold")}>
                            <div className="flex items-center gap-2">
                              {isLowStock && <AlertTriangle className="h-4 w-4 text-destructive" />}
                              {product.stock}
                              {product.calculationType === 'Per Pc' && ' nos'}
                              {product.calculationType === 'Per Kg' && ' kg'}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(product.salePrice)}
                            {product.calculationType === 'Per Kg' && <span className="text-muted-foreground text-xs">/kg</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            {product.gst || 0}%
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0" disabled={!firebaseStatus.connected}>
                                  <span className="sr-only">Open menu</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setProductToEdit(product);
                                    setIsEditDialogOpen(true);
                                  }}
                                >
                                  <Edit className="mr-2 h-4 w-4" /> Edit Product
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                <DropdownMenuItem
                                  onClick={() => setProductToDelete(product)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card View (Removed Cost Price Line) */}
            <div className="md:hidden space-y-4">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-2">
                      <Skeleton className="h-6 w-3/4" />
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                filteredProducts.map((product) => {
                  const isLowStock = product.reorderPoint !== undefined && product.stock <= product.reorderPoint;
                  return (
                    <Card key={product.id} className="transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-lg font-semibold">{product.name}</CardTitle>
                          <Badge variant="secondary">{product.category || 'General'}</Badge>
                        </div>
                        {product.brand && <CardDescription className="text-sm">Brand: {product.brand}</CardDescription>}
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">SKU:</span>
                          <span>{product.sku}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Stock:</span>
                          <span className={cn('font-medium', isLowStock && 'text-destructive')}>
                            {product.stock} {product.calculationType === 'Per Pc' ? 'nos' : product.calculationType === 'Per Kg' ? 'kg' : ''}
                            {isLowStock && <AlertTriangle className="inline h-4 w-4 ml-1" />}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Sale Price:</span>
                          <span className="font-semibold">{formatNumber(product.salePrice)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">GST%:</span>
                          <span>{product.gst || 0}%</span>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-2 border-t">
                        <div className="flex justify-end space-x-2 w-full">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setProductToEdit(product);
                              setIsEditDialogOpen(true);
                            }}
                            disabled={!firebaseStatus.connected}
                          >
                            <Edit className="mr-1 h-4 w-4" /> Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setProductToDelete(product)}
                            disabled={!firebaseStatus.connected}
                          >
                            <Trash2 className="mr-1 h-4 w-4" /> Delete
                          </Button>
                        </div>
                      </CardFooter>
                    </Card>
                  );
                })
              )}
              {filteredProducts.length === 0 && !loading && (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">No products found.</p>
                  </CardContent>
                </Card>
              )}
              <ScrollArea className="h-2" />
            </div>
          </CardContent>
          <CardFooter>
            <p className="text-sm text-muted-foreground">Showing {filteredProducts.length} of {products.length} products.</p>
          </CardFooter>
        </Card>
      </div>

      {/* Dialogs */}
      <AddProductDialog
        isOpen={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onProductAdded={handleProductAdded}
      />

      <EditProductDialog
        isOpen={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        productToEdit={productToEdit}
        handleEditSubmit={handleEditProduct}
      />

      <AlertDialog open={!!productToDelete} onOpenChange={(open) => !open && setProductToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete
              product <span className="font-bold">{productToDelete?.name}</span> and remove its data from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProduct} className="bg-destructive hover:bg-red-700">
              Delete Product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default InventoryClient;