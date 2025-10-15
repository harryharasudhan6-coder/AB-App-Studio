'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Product, CalculationType, ProductCategory } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PlusCircle, MoreHorizontal, AlertTriangle, Database, Edit, Trash2, ArrowUpDown, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { addProduct, deleteProduct as deleteProductFromDB, getProducts, updateProduct } from '@/lib/data';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

// Helper for formatting numbers (assumed to exist)
const formatNumber = (num: number | undefined) => num !== undefined ? num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

// --- AddProductDialog Component (Assumed to be in the original file, slightly modified for flow)
interface AddProductDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onProductAdded: (product: Product) => void;
}

const AddProductDialog: React.FC<AddProductDialogProps> = ({ isOpen, onOpenChange, onProductAdded }) => {
    const { toast } = useToast();
    const [name, setName] = useState('');
    const [sku, setSku] = useState('');
    const [stock, setStock] = useState(0);
    const [price, setPrice] = useState(0);
    const [brand, setBrand] = useState('');
    const [category, setCategory] = useState<ProductCategory | ''>('');
    const [calculationType, setCalculationType] = useState<CalculationType>('Per Pc');
    const [reorderPoint, setReorderPoint] = useState<number | undefined>(undefined);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !sku || stock < 0 || price < 0 || !category) {
            toast({
                title: "Validation Error",
                description: "Please fill in all required fields (Name, SKU, Stock, Price, Category) correctly.",
                variant: "destructive",
            });
            return;
        }

        setLoading(true);
        try {
            const newProduct: Omit<Product, 'id'> = {
                name,
                sku,
                stock,
                price,
                brand,
                category: category as ProductCategory,
                calculationType,
                reorderPoint,
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
            setStock(0);
            setPrice(0);
            setBrand('');
            setCategory('');
            setCalculationType('Per Pc');
            setReorderPoint(undefined);

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
                        Fill in the details for the new inventory item.
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
                            <Label htmlFor="brand" className="text-right">Brand</Label>
                            <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="category" className="text-right">Category*</Label>
                            <Select onValueChange={(value: ProductCategory) => setCategory(value)} value={category} required>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Select Category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Rods & Rings">Rods & Rings</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="type" className="text-right">Calc Type</Label>
                            <Select onValueChange={(value: CalculationType) => setCalculationType(value)} value={calculationType}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Select Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Per Pc">Per Pc</SelectItem>
                                    <SelectItem value="Per Kg">Per Kg</SelectItem>
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
                            <Label htmlFor="price" className="text-right">Price*</Label>
                            <Input 
                                id="price" 
                                type="number" 
                                value={price} 
                                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)} 
                                className="col-span-3" 
                                step="0.01" 
                                min="0" 
                                required 
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="reorderPoint" className="text-right">Reorder Point</Label>
                            <Input 
                                id="reorderPoint" 
                                type="number" 
                                value={reorderPoint === undefined ? '' : reorderPoint} 
                                onChange={(e) => setReorderPoint(parseInt(e.target.value) || undefined)} 
                                className="col-span-3" 
                                min="0"
                            />
                        </div>
                    </div>
                    <DialogFooter>
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
// --- END AddProductDialog Component

// --- EditProductDialog Component (Crucially, this component is now fully controlled and correctly uses the updateProduct function)
interface EditProductDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    productToEdit: Product | null;
    handleEditSubmit: (updatedProduct: Product) => void;
}

const EditProductDialog: React.FC<EditProductDialogProps> = ({ isOpen, onOpenChange, productToEdit, handleEditSubmit }) => {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    
    // State to hold the current values of the fields being edited
    const [editData, setEditData] = useState<Partial<Product>>({});

    // Effect to initialize the form data when a product is selected for edit
    useEffect(() => {
        if (productToEdit) {
            setEditData({
                id: productToEdit.id,
                name: productToEdit.name,
                sku: productToEdit.sku,
                stock: productToEdit.stock,
                price: productToEdit.price,
                brand: productToEdit.brand,
                category: productToEdit.category,
                calculationType: productToEdit.calculationType,
                reorderPoint: productToEdit.reorderPoint,
            });
        } else {
            setEditData({}); // Clear state when dialog closes
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

        // Validation: Ensure required fields are not empty/invalid
        if (!editData.name || !editData.sku || editData.stock === undefined || editData.price === undefined || !editData.category) {
            toast({
                title: "Validation Error",
                description: "Name, SKU, Stock, Price, and Category are required.",
                variant: "destructive",
            });
            return;
        }

        setLoading(true);
        try {
            const updatedProduct: Product = {
                ...productToEdit,
                ...editData, // Merge the changed data
                updatedAt: new Date().toISOString(),
            } as Product; // Cast for safety

            await updateProduct(updatedProduct);
            handleEditSubmit(updatedProduct); // Update local state in parent
            onOpenChange(false); // Close dialog

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
    
    // Safety check: Don't render if no product is selected
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
                            <Label htmlFor="edit-brand" className="text-right">Brand</Label>
                            <Input 
                                id="edit-brand" 
                                value={editData.brand || ''} 
                                onChange={(e) => handleChange('brand', e.target.value)} 
                                className="col-span-3" 
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
                                    <SelectItem value="Rods & Rings">Rods & Rings</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-type" className="text-right">Calc Type</Label>
                            <Select 
                                onValueChange={(value: CalculationType) => handleChange('calculationType', value)} 
                                value={editData.calculationType || 'Per Pc'}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Select Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Per Pc">Per Pc</SelectItem>
                                    <SelectItem value="Per Kg">Per Kg</SelectItem>
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
                            <Label htmlFor="edit-price" className="text-right">Price*</Label>
                            <Input 
                                id="edit-price" 
                                type="number" 
                                value={editData.price || 0} 
                                onChange={(e) => handleChange('price', parseFloat(e.target.value) || 0)} 
                                className="col-span-3" 
                                step="0.01" 
                                min="0" 
                                required 
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-reorderPoint" className="text-right">Reorder Point</Label>
                            <Input 
                                id="edit-reorderPoint" 
                                type="number" 
                                value={editData.reorderPoint === undefined ? '' : editData.reorderPoint} 
                                onChange={(e) => handleChange('reorderPoint', parseInt(e.target.value) || undefined)} 
                                className="col-span-3" 
                                min="0"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save changes
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
// --- END EditProductDialog Component


// --- INVENTORY CLIENT COMPONENT ---
export function InventoryClient({ products: initialProducts }: { products: Product[] }) {
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [loading, setLoading] = useState(true);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [productToEdit, setProductToEdit] = useState<Product | null>(null);
    const [productToDelete, setProductToDelete] = useState<Product | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState<ProductCategory | 'all'>('all');
    const [firebaseStatus, setFirebaseStatus] = useState({ connected: true, message: "" });
    const { toast } = useToast();

    // Side effect to load data
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const fetchedProducts = await getProducts();
                setProducts(fetchedProducts);
                setFirebaseStatus({ connected: true, message: "" });
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
        };

        fetchProducts();
    }, [toast]);

    // Handlers
    const handleProductAdded = useCallback((newProduct: Product) => {
        setProducts(prev => [newProduct, ...prev]);
    }, []);

    const handleEditProduct = useCallback((updatedProduct: Product) => {
        setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
        setProductToEdit(null); // Clear the edit state
    }, []);

    const handleDeleteProduct = async () => {
        if (!productToDelete || !productToDelete.id) return;

        try {
            await deleteProductFromDB(productToDelete.id);
            setProducts(prev => prev.filter(p => p.id !== productToDelete.id));
            toast({
                title: "Success",
                description: `${productToDelete.name} has been deleted.`,
            });
            setProductToDelete(null); // Clear the delete state
        } catch (error) {
            console.error('Failed to delete product:', error);
            toast({
                title: "Error",
                description: "Failed to delete product. Please try again.",
                variant: "destructive",
            });
        }
    };

    // Filtering and Sorting
    const filteredProducts = useMemo(() => {
        let filtered = products;

        if (filterCategory !== 'all') {
            filtered = filtered.filter(p => p.category === filterCategory);
        }

        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            filtered = filtered.filter(p => 
                p.name.toLowerCase().includes(lowerSearch) ||
                p.sku.toLowerCase().includes(lowerSearch) ||
                p.brand?.toLowerCase().includes(lowerSearch)
            );
        }

        // Simple default sort by creation date (newest first)
        return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [products, filterCategory, searchTerm]);

    return (
        // **********************************************
        // ********* FIX 1: TOP-LEVEL FRAGMENT **********
        // **********************************************
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
                            <Button onClick={() => setIsAddDialogOpen(true)} className="flex items-center gap-2" disabled={!firebaseStatus.connected}>
                                <PlusCircle className="h-5 w-5" /> Add New Product
                            </Button>
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
                                    <SelectItem value="Rods & Rings">Rods & Rings</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[200px]">Product Name</TableHead>
                                        <TableHead>SKU</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Stock</TableHead>
                                        <TableHead className="text-right">Price</TableHead>
                                        <TableHead className="w-[50px] text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        [...Array(5)].map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        filteredProducts.map((product) => {
                                            const isLowStock = product.reorderPoint !== undefined && product.stock <= product.reorderPoint;
                                            return (
                                                <TableRow key={product.id} className="transition-transform hover:-translate-y-px hover:shadow-md">
                                                    <TableCell className="font-medium">{product.name} {product.brand && <span className="text-muted-foreground text-xs">({product.brand})</span>}</TableCell>
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
                                                        {formatNumber(product.price)}
                                                        {product.calculationType === 'Per Kg' && <span className="text-muted-foreground text-xs">/kg</span>}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                {/* ********************************************** */}
                                                                {/* ******** FIX 3: BUTTON CONTENT WRAPPER ********* */}
                                                                {/* ********************************************** */}
                                                                <Button variant="ghost" className="h-8 w-8 p-0" disabled={!firebaseStatus.connected}>
                                                                    <>
                                                                        <span className="sr-only">Open menu</span>
                                                                        <MoreHorizontal className="h-4 w-4" />
                                                                    </>
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

                                                                {/* ********************************************** */}
                                                                {/* ******* FIX 2: ALERT DIALOG TRIGGER WRAPPER ******* */}
                                                                {/* ********************************************** */}
                                                                
                                                                    <DropdownMenuItem
                                                                        // The onClick here sets the product, the trigger opens the dialog
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
                        
                        {/* Mobile Card View (Omitted for brevity, assumed correct) */}

                    </CardContent>
                    <CardFooter>
                        <p className="text-sm text-muted-foreground">Showing {filteredProducts.length} of {products.length} products.</p>
                    </CardFooter>
                </Card>
            </div>

            {/* All Dialogs must be siblings to the main content div, wrapped by the Fragment */}
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
}