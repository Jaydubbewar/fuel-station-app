import { Timestamp } from '@angular/fire/firestore';

export type { ClientRecord as Client } from './client.model';

export interface Transaction {
  clientId: string;
  billNo: string;
  transactionDate: Timestamp;
  quantity: number;
  rate: number;
  grossAmount: number;
  discount: number;
  netAmount: number;
  tdsRate: number;
  tdsAmount: number;
  afterTdsAmount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type TransactionRecord = Transaction & { id: string };

export type TransactionCalculationInput = Pick<
  Transaction,
  'quantity' | 'rate' | 'discount' | 'tdsRate'
>;

export type NewTransaction = Omit<
  Transaction,
  | 'grossAmount'
  | 'netAmount'
  | 'tdsAmount'
  | 'afterTdsAmount'
  | 'createdAt'
  | 'updatedAt'
>;

export type TransactionInput = Omit<NewTransaction, 'transactionDate'> & {
  transactionDate: Date | Timestamp;
};

export type TransactionChanges = Partial<Omit<NewTransaction, 'transactionDate'>> & {
  transactionDate?: Date | Timestamp;
};
