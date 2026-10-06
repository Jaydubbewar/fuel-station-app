import { Timestamp } from '@angular/fire/firestore';

export type PaymentMode = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';

export interface Payment {
  clientId: string;
  paymentDate: Timestamp;
  amount: number;
  paymentMode: PaymentMode;
  referenceNumber?: string;
  remarks?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PaymentRecord = Payment & { id: string };

export type NewPayment = Omit<Payment, 'createdAt' | 'updatedAt'>;

export type PaymentInput = Omit<NewPayment, 'paymentDate'> & {
  paymentDate: Date | Timestamp;
};

export type PaymentChanges = Partial<Omit<NewPayment, 'paymentDate'>> & {
  paymentDate?: Date | Timestamp;
};
