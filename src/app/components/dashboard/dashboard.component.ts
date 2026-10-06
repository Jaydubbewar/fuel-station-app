import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Timestamp } from '@angular/fire/firestore';
import { BehaviorSubject, Observable, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import type { jsPDF as JsPDFDocument } from 'jspdf';
import { BillEntryComponent } from '../bill-entry/bill-entry.component';
import { PaymentEntryComponent } from '../payment-entry/payment-entry.component';
import { ClientAccountDateRangeResult, ClientAccountResult, ClientAccountService } from '../../services/client-account.service';
import { ClientService } from '../../services/client.service';
import { PaymentService } from '../../services/payment.service';
import { TransactionService } from '../../services/transaction.service';
import { ClientRecord } from '../../models/client.model';
import { PaymentRecord } from '../../models/payment.model';
import { TransactionRecord } from '../../models/transaction.model';

type ActivityType = 'ALL' | 'TRANSACTIONS' | 'PAYMENTS';
interface Filters { clientId: string; from: string; to: string; activityType: ActivityType; }
interface Totals { quantity: number; grossAmount: number; afterTds: number; totalPayments: number | null; currentBalance: number | null; }
type AccountResult = ClientAccountResult | ClientAccountDateRangeResult;
type EventRow = { kind: 'BILL'; date: Date; id: string; transaction: TransactionRecord } | { kind: 'PAYMENT'; date: Date; id: string; payment: PaymentRecord };
interface LedgerRow {
  date: Date;
  type: 'OPENING BALANCE' | 'BILL' | 'PAYMENT';
  reference: string;
  quantity: number | null;
  rate: number | null;
  amount: number | null;
  discount: number | null;
  tdsRate: number | null;
  tdsAmount: number | null;
  afterTds: number | null;
  payment: number | null;
  balance: number;
  transaction: TransactionRecord | null;
  paymentRecord: PaymentRecord | null;
}
interface DashboardView {
  loading: boolean;
  error: string | null;
  selectedClient: boolean;
  clientName: string | null;
  dateRangeStart: Date | null;
  dateRangeEnd: Date | null;
  transactions: TransactionRecord[];
  ledger: LedgerRow[];
  reportLedger: LedgerRow[];
  totals: Totals;
}

function startOfDate(value: string): Date { return new Date(`${value}T00:00:00`); }
function endOfDate(value: string): Date { return new Date(`${value}T23:59:59.999`); }
function endOfToday(): Date { const date = new Date(); date.setHours(23, 59, 59, 999); return date; }
function millis(value: Date | Timestamp): number { return value instanceof Date ? value.getTime() : value.toMillis(); }
function startOfDayMillis(value: Date | Timestamp): number {
  const date = value instanceof Timestamp ? value.toDate() : value;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function formatDate(value: Date): string { return new Intl.DateTimeFormat('en-GB').format(value); }
function formatNumber(value: number): string { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
function formatQuantity(value: number | null): string { return value === null ? '—' : formatNumber(value); }
function formatAmount(value: number | null): string { return value === null ? '—' : `INR ${formatNumber(value)}`; }
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] ?? character);
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, BillEntryComponent, PaymentEntryComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly clientService = inject(ClientService);
  private readonly transactionService = inject(TransactionService);
  private readonly paymentService = inject(PaymentService);
  private readonly accountService = inject(ClientAccountService);

  clients$!: Observable<ClientRecord[]>;
  clientNames$!: Observable<Map<string, string>>;
  private clientNames = new Map<string, string>();
  view$!: Observable<DashboardView>;
  clientLoadError = '';
  transactionActionError = '';
  paymentActionError = '';
  editingTransaction: TransactionRecord | null = null;
  editingPayment: PaymentRecord | null = null;
  filters: Filters = { clientId: this.route.snapshot.queryParamMap.get('clientId') ?? '', from: '', to: '', activityType: 'ALL' };
  private readonly filters$ = new BehaviorSubject<Filters>(this.filters);

  ngOnInit(): void {
    this.clients$ = this.clientService.getClients().pipe(
      catchError((error: unknown) => {
        this.clientLoadError = error instanceof Error ? error.message : 'Unable to load clients.';
        return of([]);
      })
    );
    this.clientNames$ = this.clients$.pipe(
      map((clients) => {
        this.clientNames = new Map(clients.map((client) => [client.id, client.name] as [string, string]));
        return this.clientNames;
      })
    );

    this.view$ = this.filters$.pipe(switchMap((filters) => {
      if (!filters.clientId) {
        return this.transactionService.getTransactions({
          startDate: filters.from ? startOfDate(filters.from) : undefined,
          endDate: filters.to ? endOfDate(filters.to) : undefined
        }).pipe(
          map((transactions) => this.allClientsView(transactions)),
          startWith(this.loadingView()),
          catchError((error: unknown) => of(this.errorView(error)))
        );
      }

      return combineLatest({
        client: this.clientService.getClient(filters.clientId),
        transactions: this.transactionService.getTransactionsByClient(filters.clientId),
        payments: this.paymentService.getPaymentsByClient(filters.clientId)
      }).pipe(
        map(({ client, transactions, payments }) => {
          if (!client) throw new Error('Selected client could not be found.');
          return this.selectedClientView(client, transactions, payments, filters);
        }),
        startWith(this.loadingView()),
        catchError((error: unknown) => of(this.errorView(error)))
      );
    }));
  }

  private allClientsView(transactions: TransactionRecord[]): DashboardView {
    const totals = transactions.reduce<Totals>((total, transaction) => ({
      quantity: total.quantity + transaction.quantity,
      grossAmount: total.grossAmount + transaction.grossAmount,
      afterTds: total.afterTds + transaction.afterTdsAmount,
      totalPayments: null,
      currentBalance: null
    }), { quantity: 0, grossAmount: 0, afterTds: 0, totalPayments: null, currentBalance: null });
    return {
      loading: false, error: null, selectedClient: false, clientName: null,
      dateRangeStart: null, dateRangeEnd: null, transactions, ledger: [], reportLedger: [], totals
    };
  }

  private selectedClientView(client: ClientRecord, transactions: TransactionRecord[], payments: PaymentRecord[], filters: Filters): DashboardView {
    const hasDateRange = Boolean(filters.from || filters.to);
    const startDate: Date | Timestamp = filters.from ? startOfDate(filters.from) : client.openingBalanceDate;
    const endDate = filters.to ? endOfDate(filters.to) : endOfToday();
    if (hasDateRange && millis(startDate) > endDate.getTime()) throw new Error('From date must be on or before To date.');

    const account: AccountResult = hasDateRange
      ? this.accountService.calculateAccountForDateRange(client, transactions, payments, startDate, endDate)
      : this.accountService.calculateAccount(client, transactions, payments);
    const periodOpeningBalance = hasDateRange ? (account as ClientAccountDateRangeResult).periodOpeningBalance : client.openingBalance;
    // Normalize opening date to local calendar start-of-day for comparisons and display
    const openingTime = startOfDayMillis(client.openingBalanceDate);
    const openingDate = hasDateRange ? (startDate instanceof Date ? startDate : startDate.toDate()) : new Date(openingTime);
    const periodStart = hasDateRange ? millis(startDate) : openingTime;
    const periodEnd = hasDateRange ? endDate.getTime() : Number.POSITIVE_INFINITY;

    const events: EventRow[] = [
      ...transactions.filter((transaction) => {
        const time = transaction.transactionDate.toMillis();
        return time >= openingTime && time >= periodStart && time <= periodEnd;
      }).map((transaction): EventRow => ({ kind: 'BILL', date: transaction.transactionDate.toDate(), id: transaction.id, transaction })),
      ...payments.filter((payment) => {
        const time = payment.paymentDate.toMillis();
        return time >= openingTime && time >= periodStart && time <= periodEnd;
      }).map((payment): EventRow => ({ kind: 'PAYMENT', date: payment.paymentDate.toDate(), id: payment.id, payment }))
    ].sort((left, right) => left.date.getTime() - right.date.getTime()
      || (left.kind === right.kind ? 0 : left.kind === 'BILL' ? -1 : 1)
      || left.id.localeCompare(right.id));

    const snapshotClient: ClientRecord = {
      ...client,
      openingBalance: periodOpeningBalance,
      openingBalanceDate: Timestamp.fromDate(openingDate)
    };
    const prefixTransactions: TransactionRecord[] = [];
    const prefixPayments: PaymentRecord[] = [];
    const balance = (): number => this.accountService.calculateAccount(snapshotClient, prefixTransactions, prefixPayments).currentBalance;
    const reportLedger: LedgerRow[] = [{
      date: openingDate,
      type: 'OPENING BALANCE', reference: '', quantity: null, rate: null, amount: null,
      discount: null, tdsRate: null, tdsAmount: null, afterTds: null, payment: null,
      balance: periodOpeningBalance, transaction: null, paymentRecord: null
    }];

    for (const event of events) {
      if (event.kind === 'BILL') {
        const transaction = event.transaction;
        prefixTransactions.push(transaction);
        reportLedger.push({
          date: event.date, type: 'BILL', reference: transaction.billNo,
          quantity: transaction.quantity, rate: transaction.rate, amount: transaction.grossAmount,
          discount: transaction.discount, tdsRate: transaction.tdsRate, tdsAmount: transaction.tdsAmount,
          afterTds: transaction.afterTdsAmount, payment: null, balance: balance(), transaction, paymentRecord: null
        });
      } else {
        const payment = event.payment;
        prefixPayments.push(payment);
        reportLedger.push({
          date: event.date, type: 'PAYMENT',
          reference: `${payment.paymentMode}${payment.referenceNumber ? ` / ${payment.referenceNumber}` : ''}`,
          quantity: null, rate: null, amount: null, discount: null, tdsRate: null,
          tdsAmount: null, afterTds: null, payment: payment.amount, balance: balance(), transaction: null,
          paymentRecord: payment
        });
      }
    }

    const ledger = filters.activityType === 'ALL'
      ? reportLedger
      : [reportLedger[0], ...reportLedger.slice(1).filter((row) => row.type === (filters.activityType === 'PAYMENTS' ? 'PAYMENT' : 'BILL'))];

    return {
      loading: false,
      error: null,
      selectedClient: true,
      clientName: client.name,
      dateRangeStart: openingDate,
      dateRangeEnd: endDate,
      transactions,
      ledger,
      reportLedger,
      totals: {
        quantity: account.totalQuantity,
        grossAmount: account.totalGrossAmount,
        afterTds: account.totalAfterTdsAmount,
        totalPayments: account.totalPayments,
        currentBalance: account.currentBalance
      }
    };
  }

  private loadingView(): DashboardView {
    return {
      loading: true, error: null, selectedClient: Boolean(this.filters.clientId), transactions: [], ledger: [],
      clientName: null, dateRangeStart: null, dateRangeEnd: null, reportLedger: [],
      totals: { quantity: 0, grossAmount: 0, afterTds: 0, totalPayments: null, currentBalance: null }
    };
  }

  private errorView(error: unknown): DashboardView {
    return { ...this.loadingView(), loading: false, error: error instanceof Error ? error.message : 'Unable to load dashboard data.' };
  }

  async downloadLedgerPdf(view: DashboardView): Promise<void> {
    if (!view.selectedClient || !view.clientName || !view.dateRangeStart || !view.dateRangeEnd) return;

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ]);
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const generatedDate = new Date();
    pdf.setFontSize(18);
    pdf.text('Client Account Ledger', 14, 16);
    pdf.setFontSize(11);
    pdf.text(`Client: ${view.clientName}`, 14, 25);
    pdf.setFontSize(9);
    pdf.text(`Generated: ${formatDate(generatedDate)}`, 14, 32);
    pdf.text(`Transaction period: ${formatDate(view.dateRangeStart)} - ${formatDate(view.dateRangeEnd)}`, 14, 38);

    const billCount = view.reportLedger.filter((row) => row.type === 'BILL').length;
    autoTable(pdf, {
      startY: 44,
      head: [['Bills', 'Quantity', 'Gross Amount', 'After TDS', 'Payments', 'Balance']],
      body: [[
        String(billCount),
        `${formatNumber(view.totals.quantity)} L`,
        `INR ${formatNumber(view.totals.grossAmount)}`,
        `INR ${formatNumber(view.totals.afterTds)}`,
        `INR ${formatNumber(view.totals.totalPayments ?? 0)}`,
        `INR ${formatNumber(view.totals.currentBalance ?? 0)}`
      ]],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235] }
    });

    const tableStart = (pdf as JsPDFDocument & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 54;
    autoTable(pdf, {
      startY: tableStart + 8,
      head: [[
        'Date', 'Type', 'Bill No. / Reference', 'Quantity', 'Rate', 'Amount', 'Discount',
        'TDS %', 'TDS Amount', 'After TDS', 'Payment', 'Balance'
      ]],
      body: view.reportLedger.map((row) => [
        formatDate(row.date),
        row.type,
        row.reference || '—',
        formatQuantity(row.quantity),
        formatAmount(row.rate),
        formatAmount(row.amount),
        formatAmount(row.discount),
        row.tdsRate === null ? '—' : `${(row.tdsRate * 100).toFixed(2)}%`,
        formatAmount(row.tdsAmount),
        formatAmount(row.afterTds),
        formatAmount(row.payment),
        `INR ${formatNumber(row.balance)}`
      ]),
      styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: [52, 64, 84] },
      horizontalPageBreak: true,
      horizontalPageBreakRepeat: [0, 1]
    });

    const filename = `${view.clientName.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'client'}-ledger-${generatedDate.toISOString().slice(0, 10)}.pdf`;
    pdf.save(filename);
  }

  printBill(transaction: TransactionRecord): void {
    this.transactionActionError = '';
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      this.transactionActionError = 'Allow pop-ups to print this bill.';
      return;
    }

    const billNo = escapeHtml(transaction.billNo);
    const client = escapeHtml(this.clientNames.get(transaction.clientId) ?? transaction.clientId);
    const billDate = escapeHtml(formatDate(transaction.transactionDate.toDate()));
    const html = `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Bill ${billNo}</title>
          <style>
            body { margin: 0; padding: 32px; color: #101828; font: 14px Arial, sans-serif; }
            main { max-width: 800px; margin: 0 auto; }
            header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #344054; padding-bottom: 16px; }
            h1 { margin: 0; font-size: 24px; }
            h2 { margin: 0; font-size: 20px; }
            .details { display: flex; justify-content: space-between; gap: 24px; margin: 24px 0; }
            .details div { display: grid; gap: 6px; }
            table { width: 100%; border-collapse: collapse; margin-top: 24px; }
            th, td { padding: 10px; border: 1px solid #d0d5dd; text-align: right; }
            th:first-child, td:first-child { text-align: left; }
            th { background: #f2f4f7; }
            .totals { width: 320px; margin: 20px 0 0 auto; }
            .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
            .grand-total { border-top: 1px solid #98a2b3; margin-top: 6px; padding-top: 12px !important; font-size: 16px; font-weight: 700; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <main>
            <header><h1>Fuel Station</h1><h2>Bill</h2></header>
            <section class="details">
              <div><strong>Bill No.</strong><span>${billNo}</span></div>
              <div><strong>Client</strong><span>${client}</span></div>
              <div><strong>Date</strong><span>${billDate}</span></div>
            </section>
            <table>
              <thead><tr><th>Description</th><th>Quantity (L)</th><th>Rate</th><th>Gross Amount</th></tr></thead>
              <tbody><tr><td>Fuel</td><td>${formatNumber(transaction.quantity)}</td><td>₹${formatNumber(transaction.rate)}</td><td>₹${formatNumber(transaction.grossAmount)}</td></tr></tbody>
            </table>
            <section class="totals">
              <div><span>Discount</span><span>₹${formatNumber(transaction.discount)}</span></div>
              <div><span>TDS (${(transaction.tdsRate * 100).toFixed(2)}%)</span><span>₹${formatNumber(transaction.tdsAmount)}</span></div>
              <div class="grand-total"><span>After TDS</span><span>₹${formatNumber(transaction.afterTdsAmount)}</span></div>
            </section>
          </main>
        </body>
      </html>`;

    try {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onafterprint = () => printWindow.close();
      window.setTimeout(() => {
        if (!printWindow.closed) {
          printWindow.focus();
          printWindow.print();
        }
      }, 250);
    } catch {
      printWindow.close();
      this.transactionActionError = 'Unable to open the bill for printing.';
    }
  }

  editTransaction(transaction: TransactionRecord): void {
    this.transactionActionError = '';
    this.editingTransaction = transaction;
  }

  closeTransactionEditor(): void {
    this.editingTransaction = null;
  }

  onTransactionSaved(): void {
    this.editingTransaction = null;
    this.refreshDashboard();
  }

  async deleteTransaction(transaction: TransactionRecord): Promise<void> {
    if (!window.confirm(`Delete bill ${transaction.billNo}? This action cannot be undone.`)) return;

    this.transactionActionError = '';
    try {
      await this.transactionService.deleteTransaction(transaction.id);
      this.refreshDashboard();
    } catch (error: unknown) {
      this.transactionActionError = error instanceof Error ? error.message : 'Unable to delete this transaction.';
    }
  }

  private refreshDashboard(): void {
    this.filters$.next({ ...this.filters$.value });
  }

  editPayment(payment: PaymentRecord): void {
    this.paymentActionError = '';
    this.editingPayment = payment;
  }

  closePaymentEditor(): void {
    this.editingPayment = null;
  }

  onPaymentSaved(): void {
    this.editingPayment = null;
    this.refreshDashboard();
  }

  async deletePayment(payment: PaymentRecord): Promise<void> {
    const paymentReference = payment.referenceNumber ? ` (${payment.referenceNumber})` : '';
    if (!window.confirm(`Delete this ${payment.paymentMode} payment${paymentReference}? This action cannot be undone.`)) return;

    this.paymentActionError = '';
    try {
      await this.paymentService.deletePayment(payment.id);
      this.refreshDashboard();
    } catch (error: unknown) {
      this.paymentActionError = error instanceof Error ? error.message : 'Unable to delete this payment.';
    }
  }

  onClientChanged(clientId: string): void {
    if (!clientId && this.filters.activityType === 'PAYMENTS') {
      this.filters.activityType = 'ALL';
    }
  }

  applyFilters(): void { this.filters$.next({ ...this.filters }); }

  clearFilters(): void {
    this.filters = { clientId: '', from: '', to: '', activityType: 'ALL' };
    this.filters$.next({ ...this.filters });
  }
}
