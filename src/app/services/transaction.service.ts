import { Injectable, inject } from '@angular/core';
import { Firestore, QueryConstraint, Timestamp, addDoc, collection, collectionData, deleteDoc, doc, docData, getDoc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { NewTransaction, Transaction, TransactionChanges, TransactionInput, TransactionRecord } from '../models/transaction.model';

export interface TransactionFilters {
  clientId?: string;
  startDate?: Date | Timestamp;
  endDate?: Date | Timestamp;
}

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private readonly firestore = inject(Firestore);
  private readonly transactionsRef = collection(this.firestore, 'transactions');

  async createTransaction(input: TransactionInput): Promise<string> {
    const billNo = normalizeBillNo(input.billNo);
    await this.ensureUniqueBillNumber(input.clientId, billNo);
    const { sourceFields, financialFields } = this.calculate({ ...input, billNo });
    const reference = await addDoc(this.transactionsRef, { ...sourceFields, ...financialFields, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return reference.id;
  }

  getTransaction(transactionId: string): Observable<TransactionRecord | undefined> {
    return docData(doc(this.firestore, 'transactions', transactionId), { idField: 'id' }) as Observable<TransactionRecord | undefined>;
  }

  getTransactionsByClient(clientId: string): Observable<TransactionRecord[]> {
    return this.getTransactions({ clientId });
  }

  getTransactionsByClientAndDateRange(clientId: string, startDate: Date | Timestamp, endDate: Date | Timestamp): Observable<TransactionRecord[]> {
    return this.getTransactions({ clientId, startDate, endDate });
  }

  getTransactions(filters: TransactionFilters = {}): Observable<TransactionRecord[]> {
    const constraints: QueryConstraint[] = [];
    if (filters.clientId) {
      constraints.push(where('clientId', '==', filters.clientId));
    }
    if (filters.startDate) {
      constraints.push(where('transactionDate', '>=', toTimestamp(filters.startDate)));
    }
    if (filters.endDate) {
      constraints.push(where('transactionDate', '<=', toTimestamp(filters.endDate)));
    }
    constraints.push(orderBy('transactionDate', 'asc'));

    return collectionData(query(this.transactionsRef, ...constraints), { idField: 'id' }) as Observable<TransactionRecord[]>;
  }

  async updateTransaction(transactionId: string, changes: TransactionChanges): Promise<void> {
    const reference = doc(this.firestore, 'transactions', transactionId);
    const snapshot = await getDoc(reference);
    if (!snapshot.exists()) throw new Error("Transaction not found" );
    const current = snapshot.data() as Transaction;
    const merged: TransactionInput = { clientId: changes.clientId ?? current.clientId, billNo: changes.billNo ?? current.billNo, transactionDate: changes.transactionDate ?? current.transactionDate, quantity: changes.quantity ?? current.quantity, rate: changes.rate ?? current.rate, discount: changes.discount ?? current.discount, tdsRate: changes.tdsRate ?? current.tdsRate };
    const billNo = normalizeBillNo(merged.billNo);
    await this.ensureUniqueBillNumber(merged.clientId, billNo, transactionId);
    const { sourceFields, financialFields } = this.calculate({ ...merged, billNo });
    await updateDoc(reference, { ...sourceFields, ...financialFields, updatedAt: serverTimestamp() });
  }

  async deleteTransaction(transactionId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'transactions', transactionId));
  }

  private calculate(input: TransactionInput): { sourceFields: NewTransaction; financialFields: Pick<Transaction, 'grossAmount' | 'netAmount' | 'tdsAmount' | 'afterTdsAmount'> } {
    const grossAmount = round2(input.quantity * input.rate);
    const netAmount = round2(grossAmount - input.discount);
    const tdsAmount = round2(netAmount * input.tdsRate);
    const afterTdsAmount = round2(netAmount - tdsAmount);
    return { sourceFields: { clientId: input.clientId, billNo: input.billNo, transactionDate: toTimestamp(input.transactionDate), quantity: input.quantity, rate: input.rate, discount: input.discount, tdsRate: input.tdsRate }, financialFields: { grossAmount, netAmount, tdsAmount, afterTdsAmount } };
  }

  private async ensureUniqueBillNumber(clientId: string, billNo: string, excludeTransactionId?: string): Promise<void> {
    if (!billNo) {
      throw new Error('Bill number is required.');
    }

    const clientTransactions = await getDocs(query(this.transactionsRef, where('clientId', '==', clientId)));
    const duplicateExists = clientTransactions.docs.some(transaction =>
      transaction.id !== excludeTransactionId && normalizeBillNo(transaction.data()['billNo']) === billNo
    );

    if (duplicateExists) {
      throw new Error('Bill number already exists for this client.');
    }
  }
}

function normalizeBillNo(value: unknown): string {
  return String(value ?? '').trim();
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toTimestamp(value: Date | Timestamp): Timestamp {
  return value instanceof Timestamp ? value : Timestamp.fromDate(value);
}
