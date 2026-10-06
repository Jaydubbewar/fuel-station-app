import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  addDoc,
  docData,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Client, ClientRecord, NewClient } from '../models/client.model';
import { environment } from '../../environments/environment';

type ClientInput = NewClient | {
  name: string;
  mobile?: string;
  address?: string;
  gstNumber?: string;
  openingBalance: number;
  defaultDiscountPerLiter?: number;
  defaultTdsRate?: number;
  isActive: boolean;
};

@Injectable({ providedIn: 'root' })
export class ClientService {
  private readonly firestore = inject(Firestore);
  private readonly clientsRef = collection(this.firestore, 'clients');

  async createClient(client: ClientInput): Promise<string> {
    const values = client as ClientInput & Partial<Client>;
    function startOfDayLocal(d: Date): Date {
      const result = new Date(d);
      result.setHours(0, 0, 0, 0);
      return result;
    }

    const data: Omit<Client, 'createdAt' | 'updatedAt'> = {
      name: values.name.trim(),
      address: values.address,
      phone: values.phone ?? ('mobile' in values ? values.mobile : undefined),
      email: values.email,
      gstNumber: values.gstNumber,
      openingBalance: values.openingBalance,
      // openingBalanceDate is a calendar date. Default to today's local start-of-day rather than Timestamp.now().
      openingBalanceDate: values.openingBalanceDate ?? Timestamp.fromDate(startOfDayLocal(new Date())),
      openingBalanceNote: values.openingBalanceNote,
      defaultDiscountPerLiter: values.defaultDiscountPerLiter ?? environment.defaults.discountPerLiter,
      defaultTdsRate: values.defaultTdsRate ?? environment.defaults.tdsRate,
      isActive: values.isActive
    };
    const reference = await addDoc(this.clientsRef, {
      ...withoutUndefined(data),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return reference.id;
  }

  getClient(clientId: string): Observable<ClientRecord | undefined> {
    return docData(doc(this.firestore, 'clients', clientId), { idField: 'id' }) as Observable<ClientRecord | undefined>;
  }

  getClients(): Observable<ClientRecord[]> {
    const activeClients = query(this.clientsRef, where('isActive', '==', true), orderBy('name'));
    return collectionData(activeClients, { idField: 'id' }) as Observable<ClientRecord[]>;
  }

  getAllClients(): Observable<ClientRecord[]> {
    const allClients = query(this.clientsRef, orderBy('name'));
    return collectionData(allClients, { idField: 'id' }) as Observable<ClientRecord[]>;
  }

  async updateClient(clientId: string, changes: Partial<Omit<Client, 'createdAt' | 'updatedAt'>>): Promise<void> {
    await updateDoc(doc(this.firestore, 'clients', clientId), {
      ...withoutUndefined(changes),
      updatedAt: serverTimestamp()
    });
  }

  async deactivateClient(clientId: string): Promise<void> {
    await this.updateClient(clientId, { isActive: false });
  }

  async reactivateClient(clientId: string): Promise<void> {
    await this.updateClient(clientId, { isActive: true });
  }

  async deleteClient(clientId: string): Promise<void> {
    await this.deactivateClient(clientId);
  }
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  ) as T;
}
