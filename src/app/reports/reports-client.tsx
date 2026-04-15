

'use client';

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb, Loader2, TrendingUp, PackageX, AlertTriangle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { generateReportNarrative } from '@/ai/flows/generate-report-narrative';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const formatNumber = (value: number | undefined, isCurrency = true) => {
    if (value === undefined || isNaN(value)) {
        return isCurrency ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(0) : '0';
    }
    if (isCurrency) {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', currencyDisplay: 'symbol' }).format(value);
    }
    return value.toLocaleString('en-IN');
};


const chartConfig = {
  views: {
    label: "Page Views",
  },
  desktop: {
    label: "Desktop",
    color: "hsl(var(--chart-1))",
  },
  mobile: {
    label: "Mobile",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;


export function ReportsClient({ reportData }: { reportData: any }) {
    const [narrative, setNarrative] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [topProductsMetric, setTopProductsMetric] = useState<'revenue' | 'units' | 'profit'>('revenue');

    const topProductsData = useMemo(() => {
        let sortedProducts = [...reportData.productPerformance];
        
        if (topProductsMetric === 'revenue') {
            sortedProducts.sort((a, b) => b.totalRevenue - a.totalRevenue);
        } else if (topProductsMetric === 'units') {
            sortedProducts.sort((a, b) => b.unitsSold - a.unitsSold);
        } else if (topProductsMetric === 'profit') {
            sortedProducts.sort((a, b) => b.estimatedProfit - a.estimatedProfit);
        }

        return sortedProducts.slice(0, 5);

    }, [reportData.productPerformance, topProductsMetric]);


    const handleGenerateNarrative = async () => {
        setIsLoading(true);
        setNarrative('');
        const dataSummary = `
            Total Revenue: ${formatNumber(reportData.totalRevenue)}
            Total Customers: ${reportData.totalCustomers}
            Orders Placed: ${reportData.ordersPlaced}
            Monthly Profitability: ${JSON.stringify(reportData.profitabilityChartData)}
            Top Products by Revenue: ${JSON.stringify(reportData.productPerformance.sort((a,b) => b.totalRevenue - a.totalRevenue).slice(0,3))}
            Inventory Turnover Rate: ${reportData.inventoryTurnoverRate}
            Dead Stock Count: ${reportData.deadStock.length}
            Stockouts: ${reportData.stockoutProducts.length}
        `;
        try {
            const result = await generateReportNarrative({ reportData: dataSummary });
            setNarrative(result.narrative);
        } catch (error) {
            setNarrative('Failed to generate narrative.');
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };
    

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Business Health Command Center</h1>
                <Button onClick={handleGenerateNarrative} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lightbulb className="mr-2 h-4 w-4" />}
                    {isLoading ? 'Generating...' : 'Generate AI Narrative'}
                </Button>
            </div>
            
            {narrative && (
                 <Alert>
                    <Lightbulb className="h-4 w-4" />
                    <AlertTitle>AI-Generated Report Summary</AlertTitle>
                    <AlertDescription>
                       {narrative}
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Inventory Turnover Rate</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{reportData.inventoryTurnoverRate}</div>
                        <p className="text-xs text-muted-foreground">Times inventory sold and replaced in the last year. Higher is better.</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Dead Stock Items</CardTitle>
                        <PackageX className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{reportData.deadStock.length}</div>
                        <p className="text-xs text-muted-foreground">Products not sold in the last 6 months. Consider discounting.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Current Stockouts</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{reportData.stockoutProducts.length}</div>
                        <p className="text-xs text-muted-foreground">Products with zero stock, potentially losing sales.</p>
                    </CardContent>
                </Card>
            </div>


            <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
                <Card>
                     <CardHeader>
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle>Top Performing Products</CardTitle>
                                <CardDescription>Your best-selling products.</CardDescription>
                            </div>
                            <Select value={topProductsMetric} onValueChange={(v) => setTopProductsMetric(v as any)}>
                                <SelectTrigger className="w-[120px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="revenue">Revenue</SelectItem>
                                    <SelectItem value="units">Units Sold</SelectItem>
                                    <SelectItem value="profit">Est. Profit</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-right">
                                        {topProductsMetric === 'revenue' && 'Revenue'}
                                        {topProductsMetric === 'units' && 'Units'}
                                        {topProductsMetric === 'profit' && 'Est. Profit'}
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {topProductsData?.map((p: any) => (
                                    <TableRow key={p.productId}>
                                        <TableCell>{p.productName}</TableCell>
                                        <TableCell className="text-right font-medium">
                                            {topProductsMetric === 'revenue' && formatNumber(p.totalRevenue)}
                                            {topProductsMetric === 'units' && formatNumber(p.unitsSold, false)}
                                            {topProductsMetric === 'profit' && formatNumber(p.estimatedProfit)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Profitability Over Time</CardTitle>
                        <CardDescription>A visual representation of revenue vs estimated profit each month.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <ChartContainer config={chartConfig} className="h-[250px] w-full">
                            <ResponsiveContainer>
                                <BarChart data={reportData.profitabilityChartData}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />
                                    <YAxis tickFormatter={(value) => formatNumber(value as number)} />
                                    <Tooltip
										cursor={false}
										content={
											<ChartTooltipContent
												hideLabel
												formatter={(value, name) => {
													const label = name === "revenue" ? "Revenue" : "Est. Profit";
													return (
														<>
															<div
																className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-[--color-bg]"
																style={ { "--color-bg": name === "revenue" ? "hsl(var(--chart-2))" : "hsl(var(--chart-1))" } as React.CSSProperties }
															/>
															{label}
															<div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums">
																{formatNumber(value as number)}
															</div>
														</>
													)
												}}
										/>
									}
								/>
                                    <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={4} />
                                    <Bar dataKey="profit" fill="hsl(var(--chart-1))" radius={4} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Dead Stock (Last 6 Months)</CardTitle>
                        <CardDescription>These products haven't sold recently.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead className="text-right">Stock Left</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {reportData.deadStock?.map((p: any) => (
                                    <TableRow key={p.sku}>
                                        <TableCell>{p.productName}</TableCell>
                                        <TableCell>{p.sku}</TableCell>
                                        <TableCell className="text-right">{formatNumber(p.stock, false)}</TableCell>
                                        <TableCell className="text-right">{formatNumber(p.stock * p.cost)}</TableCell>
                                    </TableRow>
                                ))}
                                {reportData.deadStock.length === 0 && <TableRow><TableCell colSpan={4} className="text-center">No dead stock found. Great!</TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Stockout Impact Analysis</CardTitle>
                        <CardDescription>Estimated daily lost revenue for out-of-stock items.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                             <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Avg. Daily Sales</TableHead><TableHead className="text-right">Est. Lost Revenue/Day</TableHead></TableRow></TableHeader>
                             <TableBody>
                                {reportData.stockoutProducts?.map((p: any) => (
                                    <TableRow key={p.productName}>
                                        <TableCell>{p.productName}</TableCell>
                                        <TableCell className="text-right">{formatNumber(p.avgDailySales, false)}</TableCell>
                                        <TableCell className="text-right text-destructive font-medium">{formatNumber(p.potentialLostRevenuePerDay)}</TableCell>
                                    </TableRow>
                                ))}
                                {reportData.stockoutProducts.length === 0 && <TableRow><TableCell colSpan={3} className="text-center">No stockouts currently. Keep it up!</TableCell></TableRow>}
                             </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
