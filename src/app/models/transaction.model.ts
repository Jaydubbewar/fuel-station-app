export interface Client {
  id?: string;
  name: string;
  currentBalance: number; // running debit balance (positive = client owes us)
  mobile?: string;
  address?: string;
  gstNumber?: string;
  openingBalance?: number;
  isActive?: boolean;
  createdAt?: any;
}

export interface ClientInput {
  name: string;
  mobile: string;
  address: string;
  gstNumber: string;
  openingBalance: number;
  isActive: boolean;
}

export interface Transaction {
  id?: string;
  srNo?: number;          // display-only, derived from list order/date
  date: string;            // 'yyyy-MM-dd'
  billNo: string;
  clientId: string;
  clientName: string;      // denormalized for easy display/filtering
  quantity: number;        // liters

  rate: number;
  amount: number;          // quantity * rate

  discountPct: number;
  discountAmount: number;  // amount * discountPct / 100

  tdsPct: number;
  tdsAmount: number;       // (amount - discountAmount) * tdsPct / 100

  afterTdsAmount: number;  // amount - discountAmount - tdsAmount

  creditAmount: number;    // payment received against this bill, if any
  debitBalance: number;    // running balance AFTER this transaction (snapshot)

  createdAt?: any;
}

// Fields the user actually types in; everything else is derived.
export type TransactionInput = Pick<
  Transaction,
  'date' | 'billNo' | 'clientId' | 'clientName' | 'quantity' | 'rate' | 'discountPct' | 'tdsPct' | 'creditAmount'
>;
