import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  addDoc,
  serverTimestamp,
  query,
  orderBy
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Client, ClientInput } from '../models/transaction.model';

@Injectable({ providedIn: 'root' })
export class ClientService {
  private firestore = inject(Firestore);
  private clientsRef = collection(this.firestore, 'clients');

  /** Live list of all clients, alphabetical - used for the client dropdown & filter. */
  getClients(): Observable<Client[]> {
    const q = query(this.clientsRef, orderBy('name'));
    return collectionData(q, { idField: 'id' }) as Observable<Client[]>;
  }

  /** Live single client doc - used to read currentBalance before a new bill. */
  getClient(clientId: string): Observable<Client> {
    const ref = doc(this.firestore, `clients/${clientId}`);
    return docData(ref, { idField: 'id' }) as Observable<Client>;
  }

  /** Creates a client and initializes its running balance from its opening balance. */
  async createClient(input: ClientInput): Promise<string> {
    const ref = await addDoc(this.clientsRef, {
      ...input,
      name: input.name.trim(),
      currentBalance: input.openingBalance,
      createdAt: serverTimestamp()
    });
    return ref.id;
  }
}
