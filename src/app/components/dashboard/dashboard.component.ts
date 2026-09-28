import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, BehaviorSubject, switchMap, combineLatest, map } from 'rxjs';
import { ClientService } from '../../services/client.service';
import { TransactionService } from '../../services/transaction.service';
import { Client, Transaction } from '../../models/transaction.model';

interface Filters {
  clientId: string; // '' = all clients
  from: string;      // '' = no lower bound
  to: string;        // '' = no upper bound
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private clientService = inject(ClientService);
  private transactionService = inject(TransactionService);

  clients$!: Observable<Client[]>;
  transactions$!: Observable<Transaction[]>;
  totals$!: Observable<{ quantity: number; amount: number; afterTds: number; credit: number }>;

  filters: Filters = { clientId: '', from: '', to: '' };
  private filters$ = new BehaviorSubject<Filters>(this.filters);

  ngOnInit(): void {
    this.clients$ = this.clientService.getClients();

    this.transactions$ = this.filters$.pipe(
      switchMap((f) =>
        this.transactionService.getTransactions({
          clientId: f.clientId || undefined,
          from: f.from || undefined,
          to: f.to || undefined
        })
      )
    );

    this.totals$ = this.transactions$.pipe(
      map((rows) =>
        rows.reduce(
          (acc, r) => ({
            quantity: acc.quantity + r.quantity,
            amount: acc.amount + r.amount,
            afterTds: acc.afterTds + r.afterTdsAmount,
            credit: acc.credit + r.creditAmount
          }),
          { quantity: 0, amount: 0, afterTds: 0, credit: 0 }
        )
      )
    );
  }

  applyFilters(): void {
    this.filters$.next({ ...this.filters });
  }

  clearFilters(): void {
    this.filters = { clientId: '', from: '', to: '' };
    this.filters$.next({ ...this.filters });
  }
}
