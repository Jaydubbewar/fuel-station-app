/**
 * Core billing math for a fuel transaction.
 *
 * ASSUMED FORMULA (confirm this matches your ledger before going live):
 *   1. Amount            = Quantity x Rate
 *   2. Discount Amount   = Amount x Discount% / 100
 *   3. TDS Amount        = (Amount - Discount Amount) x TDS% / 100
 *   4. After TDS Amount  = Amount - Discount Amount - TDS Amount
 *   5. New Debit Balance = Previous Balance + After TDS Amount - Credit Amount
 *
 * All amounts are rounded to 2 decimals at each step to avoid floating point
 * drift over many transactions. If you'd rather store paise as integers,
 * swap the rounding helper below.
 */

export interface CalculatedTransaction {
  amount: number;
  discountAmount: number;
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
  discountPct: number;
  tdsPct: number;
  creditAmount: number;
  previousBalance: number;
}): CalculatedTransaction {
  const { quantity, rate, discountPct, tdsPct, creditAmount, previousBalance } = params;

  const amount = round2(quantity * rate);
  const discountAmount = round2((amount * discountPct) / 100);
  const amountAfterDiscount = round2(amount - discountAmount);
  const tdsAmount = round2((amountAfterDiscount * tdsPct) / 100);
  const afterTdsAmount = round2(amountAfterDiscount - tdsAmount);
  const debitBalance = round2(previousBalance + afterTdsAmount - (creditAmount || 0));

  return { amount, discountAmount, tdsAmount, afterTdsAmount, debitBalance };
}
