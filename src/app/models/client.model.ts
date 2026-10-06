import { Timestamp } from '@angular/fire/firestore';

export interface Client {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  gstNumber?: string;
  openingBalance: number;
  openingBalanceDate: Timestamp;
  openingBalanceNote?: string;
  defaultDiscountPerLiter?: number;
  defaultTdsRate?: number;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ClientRecord = Client & { id: string };

export type NewClient = Omit<Client, 'createdAt' | 'updatedAt'>;
