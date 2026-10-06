/**
 * Core billing math for a fuel transaction.
 *
 * Formula:
 *   1. Amount            = Quantity x Rate
 *   2. Discount Amount   = Quantity x Discount per liter
 *   3. TDS Amount        = (Amount - Discount Amount) x TDS rate
 *   4. After TDS Amount  = Amount - Discount Amount - TDS Amount
 *   5. New Debit Balance = Previous Balance - After TDS Amount + Credit Amount
 *
 * All amounts are rounded to 2 decimals at each step to avoid floating point
 * drift over many transactions. If you'd rather store paise as integers,
 * swap the rounding helper below.
 */

export interface CalculatedTransaction {
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  tdsAmount: number;
  afterTdsAmount: number;
  debitBalance: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateTransaction(params: {
  quantity: number;
  rate: number;
  discountPerLiter: number;
  tdsRate: number;
  creditAmount: number;
  previousBalance: number;
}): CalculatedTransaction {
  const { quantity, rate, discountPerLiter, tdsRate, creditAmount, previousBalance } = params;

  const grossAmount = round2(quantity * rate);
  const discountAmount = round2(quantity * discountPerLiter);
  const netAmount = round2(grossAmount - discountAmount);
  const tdsAmount = round2(netAmount * tdsRate);
  const afterTdsAmount = round2(netAmount - tdsAmount);
  const debitBalance = round2(previousBalance - afterTdsAmount + (creditAmount || 0));

  return { grossAmount, discountAmount, netAmount, tdsAmount, afterTdsAmount, debitBalance };
}
