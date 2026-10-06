import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom, Observable, Subscription, shareReplay } from 'rxjs';
import { ClientService } from '../../services/client.service';
import { TransactionService } from '../../services/transaction.service';
import { Client } from '../../models/transaction.model';
import { calculateTransaction } from '../../utils/calculations';
import { getFirebaseConfigurationError } from '../../utils/firebase-configuration';
import { environment } from '../../../environments/environment';
import { TransactionRecord } from '../../models/transaction.model';

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
export class BillEntryComponent implements OnDestroy, OnInit, OnChanges {
  private fb = inject(FormBuilder);
  private clientService = inject(ClientService);
  private transactionService = inject(TransactionService);

  clients$!: Observable<Client[]>;
  private clientSelectionSubscription?: Subscription;
  @Input() transactionToEdit: TransactionRecord | null = null;
  @Output() transactionSaved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
  submitting = false;
  successMessage = '';
  errorMessage = '';

  form = this.fb.nonNullable.group({
    date: [todayIso(), Validators.required],
    billNo: ['', Validators.required],
    clientId: ['', Validators.required],
    quantity: [0, [Validators.required, Validators.min(0.01)]],
    rate: [environment.defaults.rate, [Validators.required, Validators.min(0)]],
    discountPerLiter: [environment.defaults.discountPerLiter, [Validators.required, Validators.min(0)]],
    tdsRate: [environment.defaults.tdsRate, [Validators.required, Validators.min(0)]]
  });

  ngOnInit(): void {
    this.clients$ = this.clientService.getClients().pipe(shareReplay({ bufferSize: 1, refCount: true }));
    if (!this.transactionToEdit) {
      this.clientSelectionSubscription = this.form.controls.clientId.valueChanges.subscribe(clientId => {
        if (!this.transactionToEdit && clientId) void this.applyClientDefaults(clientId);
      });
      const selectedClientId = this.form.controls.clientId.value;
      if (selectedClientId) void this.applyClientDefaults(selectedClientId);
    }
  }

  ngOnDestroy(): void {
    this.clientSelectionSubscription?.unsubscribe();
  }

  private async applyClientDefaults(clientId: string): Promise<void> {
    const clients = await firstValueFrom(this.clients$);
    if (this.transactionToEdit || this.form.controls.clientId.value !== clientId) return;

    const client = clients.find(item => item.id === clientId);
    if (!client) return;

    this.form.patchValue({
      discountPerLiter: client.defaultDiscountPerLiter ?? environment.defaults.discountPerLiter,
      tdsRate: client.defaultTdsRate ?? environment.defaults.tdsRate
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['transactionToEdit'] || !this.transactionToEdit) return;

    const transaction = this.transactionToEdit;
    const date = transaction.transactionDate.toDate();
    this.form.patchValue({
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      billNo: transaction.billNo,
      clientId: transaction.clientId,
      quantity: transaction.quantity,
      rate: transaction.rate,
      discountPerLiter: transaction.quantity === 0 ? 0 : transaction.discount / transaction.quantity,
      tdsRate: transaction.tdsRate
    });
  }

  /** Live preview of the calculated columns, recomputed on every keystroke. */
  get preview() {
    const v = this.form.getRawValue();
    return calculateTransaction({
      quantity: Number(v.quantity) || 0,
      rate: Number(v.rate) || 0,
      discountPerLiter: Number(v.discountPerLiter) || 0,
      tdsRate: Number(v.tdsRate) || 0,
      creditAmount: 0,
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
      const preview = this.preview;
      if (this.transactionToEdit) {
        await this.transactionService.updateTransaction(this.transactionToEdit.id, {
          transactionDate: new Date(`${v.date}T00:00:00`),
          billNo: v.billNo,
          quantity: Number(v.quantity),
          rate: Number(v.rate),
          discount: preview.discountAmount,
          tdsRate: Number(v.tdsRate)
        });
        this.successMessage = `Bill ${v.billNo} updated successfully.`;
        this.transactionSaved.emit();
        return;
      }

      await this.transactionService.createTransaction({
        transactionDate: new Date(`${v.date}T00:00:00`),
        billNo: v.billNo,
        clientId: v.clientId,
        quantity: Number(v.quantity),
        rate: Number(v.rate),
        discount: preview.discountAmount,
          tdsRate: Number(v.tdsRate)
      });

      this.successMessage = `Bill ${v.billNo} saved successfully.`;
      this.form.reset({
        date: todayIso(),
        billNo: '',
        clientId: v.clientId, // keep same client selected for rapid repeat entry
        quantity: 0,
        rate: environment.defaults.rate,
        discountPerLiter: environment.defaults.discountPerLiter,
        tdsRate: environment.defaults.tdsRate
      });
    } catch (err: any) {
      this.errorMessage = err?.message || 'Something went wrong while saving the bill.';
    } finally {
      this.submitting = false;
    }
  }
}
