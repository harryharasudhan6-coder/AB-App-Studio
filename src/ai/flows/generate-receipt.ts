'use server';

/**
 * @fileOverview Receipt generation AI agent.
 *
 * - generateReceipt - A function that handles the receipt generation process.
 * - GenerateReceiptInput - The input type for the generateReceipt function.
 * - GenerateReceiptOutput - The return type for the generateReceipt function.
 */

import {ai} from '@/ai/genkit-client';
import {z} from 'genkit';
import type { Order, Customer, Payment } from '@/lib/types';


const GenerateReceiptInputSchema = z.object({
  customerName: z.string().describe('The name of the customer.'),
  invoiceId: z.string().describe('The ID of the invoice this payment is for.'),
  payment: z.object({
    id: z.string(),
    paymentDate: z.string(),
    amount: z.number(),
    method: z.string(),
  }),
  invoiceTotal: z.number().describe('The grand total of the invoice.'),
  balanceDueAfterPayment: z.number().describe('The remaining balance on the invoice after this payment was made.'),
});
export type GenerateReceiptInput = z.infer<typeof GenerateReceiptInputSchema>;

const GenerateReceiptOutputSchema = z.object({
  receipt: z.string().describe('The generated receipt in a readable, formatted text string.'),
});
export type GenerateReceiptOutput = z.infer<typeof GenerateReceiptOutputSchema>;


export async function generateReceipt(input: GenerateReceiptInput): Promise<GenerateReceiptOutput> {
  // This flow is now deprecated in favor of client-side PDF generation.
  // It is kept for potential future use or as an example.
  // The primary receipt generation is handled in InvoicesClient.
  return { receipt: "This flow is deprecated." };
}
