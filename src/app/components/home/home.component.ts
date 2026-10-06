import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Timestamp } from '@angular/fire/firestore';
import { BehaviorSubject, Observable, catchError, combineLatest, map, of, shareReplay, startWith } from 'rxjs';
import { ClientRecord } from '../../models/client.model';
import { PaymentRecord } from '../../models/payment.model';
import { TransactionRecord } from '../../models/transaction.model';
import { ClientAccountService } from '../../services/client-account.service';
import { ClientService } from '../../services/client.service';
import { PaymentService } from '../../services/payment.service';
import { TransactionService } from '../../services/transaction.service';

type PeriodPreset = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'THIS_YEAR' | 'CUSTOM';
type BalanceStatus = 'Credit' | 'Due' | 'Settled';

interface PeriodRange {
  preset: PeriodPreset;
  start: Date;
  end: Date;
}

interface ClientSummary {
  id: string;
  name: string;
  sales: number;
  payments: number;
  balance: number;
  status: BalanceStatus;
}

interface ChartBar {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  clientName: string;
  color: string;
  value: number;
  showLabel: boolean;
}

interface ChartSeries {
  id: string;
  name: string;
  color: string;
}

interface ChartTick {
  y: number;
  label: string;
}

interface DailyChart {
  bars: ChartBar[];
  series: ChartSeries[];
  ticks: ChartTick[];
  baseline: number;
  empty: boolean;
}

interface HomeView {
  loading: boolean;
  error: string | null;
  empty: boolean;
  range: PeriodRange;
  totalSales: number;
  totalSalesLiters: number;
  totalPayments: number;
  amountReceivable: number;
  clientCredit: number;
  activeClients: number;
  todaysSales: number;
  todaysPayments: number;
  salesChart: DailyChart;
  paymentsChart: DailyChart;
  clients: ClientSummary[];
}

const CHART_WIDTH = 900;
const CHART_HEIGHT = 280;
const CHART_LEFT = 64;
const CHART_RIGHT = 16;
const CHART_TOP = 18;
const CHART_BOTTOM = 238;
const CHART_PLOT_WIDTH = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
const CHART_PLOT_HEIGHT = CHART_BOTTOM - CHART_TOP;
const CLIENT_CHART_COLORS = ['#2563eb', '#12b76a', '#f79009', '#7a5af8', '#e5484d', '#06aed4', '#dd2590', '#6172f3'];

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function toDate(value: Timestamp): Date {
  return value.toDate();
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function inRange(date: Date, range: PeriodRange): boolean {
  const time = date.getTime();
  return time >= range.start.getTime() && time <= range.end.getTime();
}

function startOfDayMillisFor(value: Timestamp): number {
  const d = value.toDate();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getPresetRange(preset: Exclude<PeriodPreset, 'CUSTOM'>, now = new Date()): PeriodRange {
  const today = startOfDay(now);
  let start: Date;

  switch (preset) {
    case 'TODAY':
      start = today;
      break;
    case 'THIS_WEEK': {
      start = new Date(today);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      break;
    }
    case 'THIS_MONTH':
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case 'THIS_YEAR':
      start = new Date(today.getFullYear(), 0, 1);
      break;
  }

  return { preset, start: startOfDay(start), end: endOfDay(now) };
}

function emptyChart(): DailyChart {
  return { bars: [], series: [], ticks: [], baseline: CHART_BOTTOM, empty: true };
}

function buildDailyChart(
  records: readonly { date: Date; amount: number; clientId: string }[],
  range: PeriodRange,
  clients: readonly ClientSummary[],
  selectedClientId: string
): DailyChart {
  const totalsByDayAndClient = new Map<string, number>();
  for (const record of records) {
    const key = `${dateKey(record.date)}:${record.clientId}`;
    totalsByDayAndClient.set(key, (totalsByDayAndClient.get(key) ?? 0) + record.amount);
  }

  const series = clients
    .map((client, index) => ({
      id: client.id,
      name: client.name,
      color: CLIENT_CHART_COLORS[index % CLIENT_CHART_COLORS.length]
    }))
    .filter(client => !selectedClientId || client.id === selectedClientId);

  const dates: Date[] = [];
  const day = startOfDay(range.start);
  const lastDay = startOfDay(range.end);
  while (day.getTime() <= lastDay.getTime()) {
    dates.push(new Date(day));
    day.setDate(day.getDate() + 1);
  }

  const amounts = dates.flatMap(date => series.map(client =>
    roundMoney(totalsByDayAndClient.get(`${dateKey(date)}:${client.id}`) ?? 0)
  ));
  const maximum = amounts.reduce((current, amount) => Math.max(current, amount), 0);
  const slotWidth = dates.length ? CHART_PLOT_WIDTH / dates.length : CHART_PLOT_WIDTH;
  const clientSlotWidth = slotWidth / Math.max(1, series.length);
  const barWidth = Math.max(1, Math.min(18, clientSlotWidth * 0.72));
  const labelInterval = Math.max(1, Math.ceil(dates.length / 9));
  const bars = dates.flatMap((date, dateIndex) => series.map((client, clientIndex) => {
    const value = roundMoney(totalsByDayAndClient.get(`${dateKey(date)}:${client.id}`) ?? 0);
    const height = maximum > 0 ? value / maximum * CHART_PLOT_HEIGHT : 0;
    return {
      x: CHART_LEFT + dateIndex * slotWidth + clientIndex * clientSlotWidth + (clientSlotWidth - barWidth) / 2,
      y: CHART_BOTTOM - height,
      width: barWidth,
      height,
      label: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date),
      clientName: client.name,
      color: client.color,
      value,
      showLabel: clientIndex === 0 && (dateIndex % labelInterval === 0 || dateIndex === dates.length - 1)
    };
  }));
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const value = maximum * (4 - index) / 4;
    return {
      y: CHART_TOP + index * CHART_PLOT_HEIGHT / 4,
      label: new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
    };
  });

  return { bars, series, ticks, baseline: CHART_BOTTOM, empty: maximum === 0 };
}

function groupByClient<T extends { clientId: string }>(records: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const clientRecords = grouped.get(record.clientId) ?? [];
    clientRecords.push(record);
    grouped.set(record.clientId, clientRecords);
  }
  return grouped;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {
  private readonly clientService = inject(ClientService);
  private readonly transactionService = inject(TransactionService);
  private readonly paymentService = inject(PaymentService);
  private readonly accountService = inject(ClientAccountService);
  private readonly router = inject(Router);

  selectedPeriod: PeriodPreset = 'THIS_MONTH';
  customFrom = dateInputValue(new Date());
  customTo = dateInputValue(new Date());
  filterError = '';
  chartClientId = '';
  view$!: Observable<HomeView>;

  private readonly period$ = new BehaviorSubject<PeriodRange>(getPresetRange('THIS_MONTH'));
  private readonly chartClientId$ = new BehaviorSubject<string>('');
  private readonly data$ = combineLatest({
    clients: this.clientService.getAllClients(),
    transactions: this.transactionService.getTransactions(),
    payments: this.paymentService.getPayments()
  }).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  ngOnInit(): void {
    this.view$ = combineLatest({ data: this.data$, range: this.period$, chartClientId: this.chartClientId$ }).pipe(
      map(({ data, range, chartClientId }) => this.buildView(data.clients, data.transactions, data.payments, range, chartClientId)),
      startWith(this.loadingView()),
      catchError((error: unknown) => of(this.errorView(error)))
    );
  }

  onPeriodChanged(preset: PeriodPreset): void {
    this.selectedPeriod = preset;
    this.filterError = '';
    if (preset !== 'CUSTOM') {
      this.period$.next(getPresetRange(preset));
    }
  }

  applyCustomRange(): void {
    this.filterError = '';
    if (!this.customFrom || !this.customTo) {
      this.filterError = 'Choose both a start date and an end date.';
      return;
    }

    const start = parseDateInput(this.customFrom);
    const end = parseDateInput(this.customTo);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) {
      this.filterError = 'The start date must be on or before the end date.';
      return;
    }

    this.period$.next({ preset: 'CUSTOM', start: startOfDay(start), end: endOfDay(end) });
  }

  onChartClientChanged(clientId: string): void {
    this.chartClientId = clientId;
    this.chartClientId$.next(clientId);
  }

  openClientLedger(clientId: string): void {
    void this.router.navigate(['/dashboard'], { queryParams: { clientId } });
  }

  private buildView(
    clients: ClientRecord[],
    transactions: TransactionRecord[],
    payments: PaymentRecord[],
    range: PeriodRange,
    chartClientId: string
  ): HomeView {
    const transactionGroups = groupByClient(transactions);
    const paymentGroups = groupByClient(payments);
    const todayRange = getPresetRange('TODAY');

    const clientSummaries = clients.map(client => {
      const clientTransactions = transactionGroups.get(client.id) ?? [];
      const clientPayments = paymentGroups.get(client.id) ?? [];
      const account = this.accountService.calculateAccount(client, clientTransactions, clientPayments);
      const balance = account.currentBalance;
      // Apply openingBalanceDate cutoff: include only records on/after the opening calendar date
      const openingTime = startOfDayMillisFor(client.openingBalanceDate);
      return {
        id: client.id,
        name: client.name,
        sales: roundMoney(clientTransactions
          .filter(transaction => {
            const tTime = toDate(transaction.transactionDate).getTime();
            return tTime >= openingTime && inRange(toDate(transaction.transactionDate), range);
          })
          .reduce((total, transaction) => total + transaction.afterTdsAmount, 0)),
        payments: roundMoney(clientPayments
          .filter(payment => {
            const pTime = toDate(payment.paymentDate).getTime();
            return pTime >= openingTime && inRange(toDate(payment.paymentDate), range);
          })
          .reduce((total, payment) => total + payment.amount, 0)),
        balance,
        status: balance > 0 ? 'Credit' as const : balance < 0 ? 'Due' as const : 'Settled' as const
      };
    }).sort((left, right) => left.name.localeCompare(right.name));

    const selectedTransactions = transactions.filter(transaction => inRange(toDate(transaction.transactionDate), range));
    const selectedPayments = payments.filter(payment => inRange(toDate(payment.paymentDate), range));
    const todaysTransactions = transactions.filter(transaction => inRange(toDate(transaction.transactionDate), todayRange));
    const todaysPayments = payments.filter(payment => inRange(toDate(payment.paymentDate), todayRange));

    return {
      loading: false,
      error: null,
      empty: clients.length === 0 && transactions.length === 0 && payments.length === 0,
      range,
      totalSales: roundMoney(selectedTransactions.reduce((total, transaction) => total + transaction.afterTdsAmount, 0)),
      totalSalesLiters: selectedTransactions.reduce((total, transaction) => total + transaction.quantity, 0),
      totalPayments: roundMoney(selectedPayments.reduce((total, payment) => total + payment.amount, 0)),
      amountReceivable: roundMoney(clientSummaries.reduce((total, client) => total + (client.balance < 0 ? Math.abs(client.balance) : 0), 0)),
      clientCredit: roundMoney(clientSummaries.reduce((total, client) => total + (client.balance > 0 ? client.balance : 0), 0)),
      activeClients: clients.filter(client => client.isActive).length,
      todaysSales: roundMoney(todaysTransactions.reduce((total, transaction) => total + transaction.afterTdsAmount, 0)),
      todaysPayments: roundMoney(todaysPayments.reduce((total, payment) => total + payment.amount, 0)),
      salesChart: buildDailyChart(selectedTransactions.map(transaction => ({ date: toDate(transaction.transactionDate), amount: transaction.afterTdsAmount, clientId: transaction.clientId })), range, clientSummaries, chartClientId),
      paymentsChart: buildDailyChart(selectedPayments.map(payment => ({ date: toDate(payment.paymentDate), amount: payment.amount, clientId: payment.clientId })), range, clientSummaries, chartClientId),
      clients: clientSummaries
    };
  }

  private loadingView(): HomeView {
    const range = this.period$.value;
    return {
      loading: true, error: null, empty: false, range,
      totalSales: 0, totalSalesLiters: 0, totalPayments: 0, amountReceivable: 0, clientCredit: 0,
      activeClients: 0, todaysSales: 0, todaysPayments: 0,
      salesChart: emptyChart(), paymentsChart: emptyChart(), clients: []
    };
  }

  private errorView(error: unknown): HomeView {
    return {
      ...this.loadingView(),
      loading: false,
      error: error instanceof Error ? error.message : 'Unable to load Home dashboard data.'
    };
  }
}
