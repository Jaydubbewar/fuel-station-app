import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, firstValueFrom } from 'rxjs';
import { ClientService } from '../../services/client.service';
import { TransactionService } from '../../services/transaction.service';
import { Client } from '../../models/transaction.model';
import { calculateTransaction } from '../../utils/calculations';
import { getFirebaseConfigurationError } from '../../utils/firebase-configuration';
import { environment } from '../../../environments/environment';

function todayIso(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

@Component({
  selector: 'app-bill-entry',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './bill-entry.component.html',
  styleUrl: './bill-entry.component.scss'
})
export class BillEntryComponent implements OnInit {
  private fb = inject(FormBuilder);
  private clientService = inject(ClientService);
  private transactionService = inject(TransactionService);

  clients$!: Observable<Client[]>;
  submitting = false;
  successMessage = '';
  errorMessage = '';

  form = this.fb.nonNullable.group({
    date: [todayIso(), Validators.required],
    billNo: ['', Validators.required],
    clientId: ['', Validators.required],
    quantity: [0, [Validators.required, Validators.min(0.01)]],
    rate: [environment.defaults.rate, [Validators.required, Validators.min(0)]],
    discountPct: [environment.defaults.discountPct, [Validators.required, Validators.min(0)]],
    tdsPct: [environment.defaults.tdsPct, [Validators.required, Validators.min(0)]],
    creditAmount: [0, [Validators.min(0)]]
  });

  ngOnInit(): void {
    this.clients$ = this.clientService.getClients();
  }

  /** Live preview of the calculated columns, recomputed on every keystroke. */
  get preview() {
    const v = this.form.getRawValue();
    return calculateTransaction({
      quantity: Number(v.quantity) || 0,
      rate: Number(v.rate) || 0,
      discountPct: Number(v.discountPct) || 0,
      tdsPct: Number(v.tdsPct) || 0,
      creditAmount: Number(v.creditAmount) || 0,
      previousBalance: 0 // client's real previous balance is applied server-side on submit
    });
  }

  async submit(): Promise<void> {
    this.successMessage = '';
    this.errorMessage = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage = 'Please complete the required fields and correct any invalid values.';
      return;
    }

    const configurationError = getFirebaseConfigurationError();
    if (configurationError) {
      this.errorMessage = configurationError;
      return;
    }

    this.submitting = true;

    try {
      const v = this.form.getRawValue();
      const clients = await firstValueFrom(this.clients$);
      const client = clients.find((c) => c.id === v.clientId);

      await this.transactionService.addTransaction({
        date: v.date,
        billNo: v.billNo,
        clientId: v.clientId,
        clientName: client?.name ?? '',
        quantity: Number(v.quantity),
        rate: Number(v.rate),
        discountPct: Number(v.discountPct),
        tdsPct: Number(v.tdsPct),
        creditAmount: Number(v.creditAmount) || 0
      });

      this.successMessage = `Bill ${v.billNo} saved successfully.`;
      this.form.reset({
        date: todayIso(),
        billNo: '',
        clientId: v.clientId, // keep same client selected for rapid repeat entry
        quantity: 0,
        rate: environment.defaults.rate,
        discountPct: environment.defaults.discountPct,
        tdsPct: environment.defaults.tdsPct,
        creditAmount: 0
      });
    } catch (err: any) {
      this.errorMessage = err?.message || 'Something went wrong while saving the bill.';
    } finally {
      this.submitting = false;
    }
  }
}
