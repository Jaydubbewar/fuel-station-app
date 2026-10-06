import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ClientRecord } from '../../models/client.model';
import { PaymentMode, PaymentRecord } from '../../models/payment.model';
import { ClientService } from '../../services/client.service';
import { PaymentService } from '../../services/payment.service';
import { getFirebaseConfigurationError } from '../../utils/firebase-configuration';

function todayIso(): string {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

@Component({
  selector: 'app-payment-entry',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './payment-entry.component.html',
  styleUrl: './payment-entry.component.scss'
})
export class PaymentEntryComponent implements OnInit, OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly clientService = inject(ClientService);
  private readonly paymentService = inject(PaymentService);

  clients$!: Observable<ClientRecord[]>;
  @Input() paymentToEdit: PaymentRecord | null = null;
  @Output() paymentSaved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
  readonly paymentModes: { value: PaymentMode; label: string }[] = [
    { value: 'CASH', label: 'Cash' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
    { value: 'UPI', label: 'UPI' },
    { value: 'CHEQUE', label: 'Cheque' },
    { value: 'OTHER', label: 'Other' }
  ];

  submitting = false;
  successMessage = '';
  errorMessage = '';

  form = this.fb.nonNullable.group({
    paymentDate: [todayIso(), Validators.required],
    clientId: ['', Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    paymentMode: ['', Validators.required],
    referenceNumber: [''],
    remarks: ['']
  });

  ngOnInit(): void {
    this.clients$ = this.clientService.getClients();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['paymentToEdit'] || !this.paymentToEdit) return;

    const payment = this.paymentToEdit;
    const date = payment.paymentDate.toDate();
    this.form.patchValue({
      paymentDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      clientId: payment.clientId,
      amount: payment.amount,
      paymentMode: payment.paymentMode,
      referenceNumber: payment.referenceNumber ?? '',
      remarks: payment.remarks ?? ''
    });
  }

  async submit(): Promise<void> {
    this.successMessage = '';
    this.errorMessage = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const configurationError = getFirebaseConfigurationError();
    if (configurationError) {
      this.errorMessage = configurationError;
      return;
    }

    this.submitting = true;
    try {
      const values = this.form.getRawValue();
      const paymentDate = new Date(`${values.paymentDate}T00:00:00`);
      if (this.paymentToEdit) {
        await this.paymentService.updatePayment(this.paymentToEdit.id, {
          paymentDate,
          amount: Number(values.amount),
          paymentMode: values.paymentMode as PaymentMode,
          referenceNumber: values.referenceNumber.trim() || undefined,
          remarks: values.remarks.trim() || undefined
        });
        this.successMessage = 'Payment updated successfully.';
        this.paymentSaved.emit();
        return;
      }

      await this.paymentService.createPayment({
        clientId: values.clientId,
        paymentDate,
        amount: Number(values.amount),
        paymentMode: values.paymentMode as PaymentMode,
        referenceNumber: values.referenceNumber.trim() || undefined,
        remarks: values.remarks.trim() || undefined
      });

      this.successMessage = 'Payment recorded successfully.';
      this.form.reset({
        paymentDate: todayIso(),
        clientId: '',
        amount: 0,
        paymentMode: '',
        referenceNumber: '',
        remarks: ''
      });
    } catch (err: any) {
      this.errorMessage = err?.message || 'Something went wrong while recording the payment.';
    } finally {
      this.submitting = false;
    }
  }
}
