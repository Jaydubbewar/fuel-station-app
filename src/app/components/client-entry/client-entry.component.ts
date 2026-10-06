import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Timestamp } from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { ClientService } from '../../services/client.service';
import { getFirebaseConfigurationError } from '../../utils/firebase-configuration';
import { environment } from '../../../environments/environment';

function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

@Component({
  selector: 'app-client-entry',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './client-entry.component.html',
  styleUrl: './client-entry.component.scss'
})
export class ClientEntryComponent implements OnInit {
  private fb = inject(FormBuilder);
  private clientService = inject(ClientService);
  private route = inject(ActivatedRoute);

  isEditMode = false;
  loadingClient = false;
  submitting = false;
  successMessage = '';
  errorMessage = '';

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    phone: [''],
    address: [''],
    email: ['', Validators.email],
    gstNumber: [''],
    openingBalance: [0, Validators.required],
    openingBalanceDate: [toDateInputValue(new Date()), Validators.required],
    openingBalanceNote: [''],
    defaultDiscountPerLiter: [environment.defaults.discountPerLiter, [Validators.required, Validators.min(0)]],
    defaultTdsRate: [environment.defaults.tdsRate, [Validators.required, Validators.min(0)]]
  });

  ngOnInit(): void {
    const clientId = this.route.snapshot.paramMap.get('id');
    if (clientId) {
      this.isEditMode = true;
      void this.loadClient(clientId);
    }
  }

  private async loadClient(clientId: string): Promise<void> {
    this.loadingClient = true;
    this.errorMessage = '';
    try {
      const client = await firstValueFrom(this.clientService.getClient(clientId));
      if (!client) {
        this.errorMessage = 'Client not found.';
        return;
      }
      this.form.patchValue({
        name: client.name,
        phone: client.phone ?? '',
        address: client.address ?? '',
        email: client.email ?? '',
        gstNumber: client.gstNumber ?? '',
        openingBalance: client.openingBalance,
        openingBalanceDate: toDateInputValue(client.openingBalanceDate?.toDate() ?? new Date()),
        openingBalanceNote: client.openingBalanceNote ?? '',
        defaultDiscountPerLiter: client.defaultDiscountPerLiter ?? environment.defaults.discountPerLiter,
        defaultTdsRate: client.defaultTdsRate ?? environment.defaults.tdsRate
      });
    } catch (err: any) {
      this.errorMessage = err?.message || 'Unable to load the client.';
    } finally {
      this.loadingClient = false;
    }
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
      const v = this.form.getRawValue();
      const clientValues = {
        name: v.name.trim(),
        address: v.address.trim(),
        phone: v.phone.trim(),
        email: v.email.trim(),
        gstNumber: v.gstNumber.trim(),
        openingBalance: Number(v.openingBalance),
        openingBalanceDate: Timestamp.fromDate(new Date(`${v.openingBalanceDate}T00:00:00`)),
        openingBalanceNote: v.openingBalanceNote.trim(),
        defaultDiscountPerLiter: Number(v.defaultDiscountPerLiter),
        defaultTdsRate: Number(v.defaultTdsRate)
      };
      const clientId = this.route.snapshot.paramMap.get('id');

      if (clientId) {
        await this.clientService.updateClient(clientId, clientValues);
        this.successMessage = 'Client updated successfully.';
      } else {
        await this.clientService.createClient({ ...clientValues, isActive: true });
        this.successMessage = 'Client created successfully.';
        this.form.reset({
          name: '',
          phone: '',
          address: '',
          email: '',
          gstNumber: '',
          openingBalance: 0,
          openingBalanceDate: toDateInputValue(new Date()),
          openingBalanceNote: '',
          defaultDiscountPerLiter: environment.defaults.discountPerLiter,
          defaultTdsRate: environment.defaults.tdsRate
        });
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Something went wrong while creating the client.';
    } finally {
      this.submitting = false;
    }
  }
}
