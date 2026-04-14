
'use server';

/**
 * @fileOverview Bulk payment allocation AI agent.
 *
 * - allocateBulkPayment - A function that handles the bulk payment allocation process.
 * - AllocateBulkPaymentInput - The input type for the allocateBulkPayment function.
 * - AllocateBulkPaymentOutput - The return type for the allocateBulkPayment function.
 */

import { ai } from '@/ai/genkit-client';
import { z } from 'zod';
import { addBulkPayment } from '@/lib/data';

const OutstandingInvoiceSchema = z.object({
  id: z.string().describe("The ID of the invoice to apply payment to."),
  orderDate: z.string(),
  balanceDue: z.number().describe("The outstanding balance of this specific invoice."),
  grandTotal: z.number(),
});

const AllocateBulkPaymentInputSchema = z.object({
  customerId: z.string().describe('The ID of the customer making the payment.'),
  paymentAmount: z.number().describe('The total amount of the payment received.'),
  paymentDate: z.string().describe('The date the payment was received.'),
  paymentMethod: z.string().describe('The method of payment (e.g., Cash, UPI).'),
  notes: z.string().optional().describe('Optional notes for the payment.'),
  invoicesToPay: z.array(OutstandingInvoiceSchema).describe("A list of the specific invoices the user has selected to apply the payment towards."),
});
export type AllocateBulkPaymentInput = z.infer<typeof AllocateBulkPaymentInputSchema>;

const AllocatedPaymentSchema = z.object({
    invoiceId: z.string().describe("The ID of the invoice the payment is being applied to."),
    amountAllocated: z.number().describe("The portion of the bulk payment allocated to this specific invoice."),
});

const AllocateBulkPaymentOutputSchema = z.object({
  allocations: z.array(AllocatedPaymentSchema).describe('A list of how the payment was allocated across the selected invoices.'),
  remainingCredit: z.number().describe("The amount of payment left over after settling the selected invoices. This can be used as a credit for the customer."),
  summary: z.string().describe("A brief, human-readable summary of the allocation process. e.g. 'Allocated 5000 to INV-001 and 1000 to INV-002, with 0 remaining.'"),
});
export type AllocateBulkPaymentOutput = z.infer<typeof AllocateBulkPaymentOutputSchema>;


export async function allocateBulkPayment(input: AllocateBulkPaymentInput): Promise<AllocateBulkPaymentOutput> {
  const allocationResult = await allocateBulkPaymentFlow(input);
  
  if (allocationResult.allocations.length > 0) {
      await addBulkPayment({
          customerId: input.customerId,
          paymentDate: input.paymentDate,
          paymentMethod: input.paymentMethod as any,
          notes: input.notes,
          allocations: allocationResult.allocations.map(alloc => ({
              orderId: alloc.invoiceId.replace('INV', 'ORD'),
              amount: alloc.amountAllocated,
          }))
      });
  }

  return allocationResult;
}


const prompt = ai.definePrompt({
  name: 'allocateBulkPaymentPrompt',
  input: {schema: AllocateBulkPaymentInputSchema},
  output: {schema: AllocateBulkPaymentOutputSchema},
  prompt: `You are an intelligent accounting assistant responsible for allocating a bulk payment from a customer to their selected outstanding invoices.

A customer has made a payment of {{{paymentAmount}}} via {{{paymentMethod}}} on {{{paymentDate}}}.

The user has explicitly chosen to apply this payment to the following invoices, which are listed in chronological order:
{{#each invoicesToPay}}
- Invoice ID: {{id}}, Current Balance Due: {{balanceDue}}
{{/each}}

Your task is to determine how to apply the payment amount to these selected invoices.

1.  Start with the first invoice in the list. Apply the payment to its balance.
2.  Do not apply more to an invoice than its current balance due.
3.  If the payment clears the first invoice and there's still money left, move to the next invoice in the list and apply the remaining amount.
4.  Continue this process until the payment is fully used or all selected invoices are paid.
5.  Keep track of how much of the payment is allocated to each invoice. The 'invoiceId' in your output must be the same as the 'id' from the input list (e.g., 'ORD-0036' becomes 'INV-0036').
6.  Any payment amount left over after all selected invoices are cleared is considered remaining credit.
7.  Provide a clear, human-readable summary of the allocations.

**Important:** Do NOT perform any balance recalculations yourself. Your only job is to decide how the lump sum of {{{paymentAmount}}} is split across the provided invoices based on their current balance due. The final balance updates will be handled by the system.

Return the result in the specified JSON format.
`,
});

const allocateBulkPaymentFlow = ai.defineFlow(
  {
    name: 'allocateBulkPaymentFlow',
    inputSchema: AllocateBulkPaymentInputSchema,
    outputSchema: AllocateBulkPaymentOutputSchema,
  },
  async input => {
    if (input.invoicesToPay.length === 0) {
        return {
            allocations: [],
            remainingCredit: input.paymentAmount,
            summary: `No invoices were selected to apply payment to. A credit of ${input.paymentAmount} has been recorded.`
        }
    }
    
    const inputForAI = {
        ...input,
        invoicesToPay: input.invoicesToPay.map(inv => ({
            ...inv,
            id: inv.id.replace('ORD', 'INV')
        }))
    };
    
    const {output} = await prompt(inputForAI);
    return output!;
  }
);
