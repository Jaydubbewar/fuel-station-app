import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  query,
  where,
  orderBy,
  runTransaction,
  serverTimestamp,
  Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Transaction, TransactionInput } from '../models/transaction.model';
import { calculateTransaction } from '../utils/calculations';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private firestore = inject(Firestore);
  private txRef = collection(this.firestore, 'transactions');

  /**
   * Adds a new bill AND atomically updates the client's running balance,
   * so two bills entered back-to-back can never read a stale balance.
   */
  async addTransaction(input: TransactionInput): Promise<void> {
    const clientDocRef = doc(this.firestore, `clients/${input.clientId}`);

    await runTransaction(this.firestore, async (tx) => {
      const clientSnap = await tx.get(clientDocRef);
      if (!clientSnap.exists()) {
        throw new Error('Client not found');
      }
      const previousBalance = (clientSnap.data()['currentBalance'] as number) ?? 0;

      const calc = calculateTransaction({
        quantity: input.quantity,
        rate: input.rate,
        discountPct: input.discountPct,
        tdsPct: input.tdsPct,
        creditAmount: input.creditAmount || 0,
        previousBalance
      });

      const newTxRef = doc(this.txRef); // auto-generated id

      const transactionDoc: Omit<Transaction, 'id'> = {
        date: input.date,
        billNo: input.billNo,
        clientId: input.clientId,
        clientName: input.clientName,
        quantity: input.quantity,
        rate: input.rate,
        amount: calc.amount,
        discountPct: input.discountPct,
        discountAmount: calc.discountAmount,
        tdsPct: input.tdsPct,
        tdsAmount: calc.tdsAmount,
        afterTdsAmount: calc.afterTdsAmount,
        creditAmount: input.creditAmount || 0,
        debitBalance: calc.debitBalance,
        createdAt: serverTimestamp()
      };

      tx.set(newTxRef, transactionDoc);
      tx.update(clientDocRef, { currentBalance: calc.debitBalance });
    });
  }

  /**
   * Dashboard filter query: by client (optional) and date range (optional).
   * Requires a composite index the first time you run a client+date query -
   * Firestore will give you a console link to auto-create it.
   */
  getTransactions(filters: { clientId?: string; from?: string; to?: string }): Observable<Transaction[]> {
    const clauses = [];
    if (filters.clientId) {
      clauses.push(where('clientId', '==', filters.clientId));
    }
    if (filters.from) {
      clauses.push(where('date', '>=', filters.from));
    }
    if (filters.to) {
      clauses.push(where('date', '<=', filters.to));
    }
    clauses.push(orderBy('date', 'asc'));

    const q = query(this.txRef, ...clauses);
    return collectionData(q, { idField: 'id' }) as Observable<Transaction[]>;
  }
}
