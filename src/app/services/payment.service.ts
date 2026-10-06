import { Injectable, inject } from '@angular/core';
import { Firestore, Timestamp, addDoc, collection, collectionData, deleteDoc, doc, docData, getDoc, orderBy, query, serverTimestamp, updateDoc, where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Payment, PaymentChanges, PaymentInput, PaymentRecord } from '../models/payment.model';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly firestore = inject(Firestore);
  private readonly paymentsRef = collection(this.firestore, 'payments');

  async createPayment(input: PaymentInput): Promise<string> {
    const reference = await addDoc(this.paymentsRef, {
      ...withoutUndefined(toPaymentFields(input)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return reference.id;
  }

  getPayment(paymentId: string): Observable<PaymentRecord | undefined> {
    return docData(doc(this.firestore, 'payments', paymentId), { idField: 'id' }) as Observable<PaymentRecord | undefined>;
  }

  getPayments(): Observable<PaymentRecord[]> {
    const allPayments = query(this.paymentsRef, orderBy('paymentDate', 'asc'));
    return collectionData(allPayments, { idField: 'id' }) as Observable<PaymentRecord[]>;
  }

  getPaymentsByClient(clientId: string): Observable<PaymentRecord[]> {
    const clientPayments = query(this.paymentsRef, where('clientId', '==', clientId), orderBy('paymentDate', 'asc'));
    return collectionData(clientPayments, { idField: 'id' }) as Observable<PaymentRecord[]>;
  }

  getPaymentsByClientAndDateRange(clientId: string, startDate: Date | Timestamp, endDate: Date | Timestamp): Observable<PaymentRecord[]> {
    const clientPayments = query(this.paymentsRef, where('clientId', '==', clientId), where('paymentDate', '>=', toTimestamp(startDate)), where('paymentDate', '<=', toTimestamp(endDate)), orderBy('paymentDate', 'asc'));
    return collectionData(clientPayments, { idField: 'id' }) as Observable<PaymentRecord[]>;
  }

  async updatePayment(paymentId: string, changes: PaymentChanges): Promise<void> {
    const reference = doc(this.firestore, 'payments', paymentId);
    const snapshot = await getDoc(reference);
    if (!snapshot.exists()) {
      throw new Error('Payment not found');
    }
    const current = snapshot.data() as Payment;
    const merged: PaymentInput = {
      clientId: changes.clientId ?? current.clientId,
      paymentDate: changes.paymentDate ?? current.paymentDate,
      amount: changes.amount ?? current.amount,
      paymentMode: changes.paymentMode ?? current.paymentMode,
      referenceNumber: changes.referenceNumber ?? current.referenceNumber,
      remarks: changes.remarks ?? current.remarks
    };
    await updateDoc(reference, {
      ...withoutUndefined(toPaymentFields(merged)),
      updatedAt: serverTimestamp()
    });
  }

  async deletePayment(paymentId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'payments', paymentId));
  }
}

function toPaymentFields(input: PaymentInput): Omit<Payment, 'createdAt' | 'updatedAt'> {
  return { ...input, paymentDate: toTimestamp(input.paymentDate) };
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  ) as T;
}

function toTimestamp(value: Date | Timestamp): Timestamp {
  return value instanceof Timestamp ? value : Timestamp.fromDate(value);
}
