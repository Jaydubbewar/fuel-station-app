import { Injectable } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
import { Client } from '../models/client.model';
import { Payment } from '../models/payment.model';
import { Transaction } from '../models/transaction.model';

export interface ClientAccountResult {
  openingBalance: number;
  totalBills: number;
  totalQuantity: number;
  totalGrossAmount: number;
  totalDiscount: number;
  totalNetAmount: number;
  totalTdsAmount: number;
  totalAfterTdsAmount: number;
  totalPayments: number;
  currentBalance: number;
}

export interface ClientAccountDateRangeResult extends ClientAccountResult {
  periodOpeningBalance: number;
  periodClosingBalance: number;
}

@Injectable({ providedIn: 'root' })
export class ClientAccountService {
  calculateAccount(client: Client, transactions: readonly Transaction[], payments: readonly Payment[]): ClientAccountResult {
    const openingBalanceTime = startOfDayMillis(client.openingBalanceDate);
    const validTransactions = transactions.filter(transaction => toMillis(transaction.transactionDate) >= openingBalanceTime);
    const validPayments = payments.filter(payment => toMillis(payment.paymentDate) >= openingBalanceTime);
    const totals = sumRecords(validTransactions, validPayments);
    return { openingBalance: client.openingBalance, ...totals, currentBalance: round2(client.openingBalance - totals.totalAfterTdsAmount + totals.totalPayments) };
  }

  calculateAccountForDateRange(client: Client, transactions: readonly Transaction[], payments: readonly Payment[], startDate: Date | Timestamp, endDate: Date | Timestamp): ClientAccountDateRangeResult {
    const openingBalanceTime = startOfDayMillis(client.openingBalanceDate);
    const startTime = toMillis(startDate);
    const endTime = toMillis(endDate);
    const validTransactions = transactions.filter(transaction => toMillis(transaction.transactionDate) >= openingBalanceTime);
    const validPayments = payments.filter(payment => toMillis(payment.paymentDate) >= openingBalanceTime);
    const priorTransactions = validTransactions.filter(transaction => toMillis(transaction.transactionDate) < startTime);
    const priorPayments = validPayments.filter(payment => toMillis(payment.paymentDate) < startTime);
    const periodTransactions = validTransactions.filter(transaction => { const date = toMillis(transaction.transactionDate); return date >= startTime && date <= endTime; });
    const periodPayments = validPayments.filter(payment => { const date = toMillis(payment.paymentDate); return date >= startTime && date <= endTime; });
    const priorTotals = sumRecords(priorTransactions, priorPayments);
    const periodTotals = sumRecords(periodTransactions, periodPayments);
    const periodOpeningBalance = round2(client.openingBalance - priorTotals.totalAfterTdsAmount + priorTotals.totalPayments);
    const periodClosingBalance = round2(periodOpeningBalance - periodTotals.totalAfterTdsAmount + periodTotals.totalPayments);
    return { openingBalance: periodOpeningBalance, ...periodTotals, currentBalance: periodClosingBalance, periodOpeningBalance, periodClosingBalance };
  }
}

function sumRecords(transactions: readonly Transaction[], payments: readonly Payment[]): Omit<ClientAccountResult, 'openingBalance' | 'currentBalance'> {
  return {
    totalBills: transactions.length,
    totalQuantity: transactions.reduce((total, transaction) => total + transaction.quantity, 0),
    totalGrossAmount: sum(transactions.map(transaction => transaction.grossAmount)),
    totalDiscount: sum(transactions.map(transaction => transaction.discount)),
    totalNetAmount: sum(transactions.map(transaction => transaction.netAmount)),
    totalTdsAmount: sum(transactions.map(transaction => transaction.tdsAmount)),
    totalAfterTdsAmount: sum(transactions.map(transaction => transaction.afterTdsAmount)),
    totalPayments: sum(payments.map(payment => payment.amount))
  };
}

function sum(values: readonly number[]): number {
  return round2(values.reduce((total, value) => total + value, 0));
}

function toMillis(value: Date | Timestamp): number {
  return value instanceof Timestamp ? value.toMillis() : value.getTime();
}

function startOfDayMillis(value: Date | Timestamp): number {
  const date = value instanceof Timestamp ? value.toDate() : value;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
