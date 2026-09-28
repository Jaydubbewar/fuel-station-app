import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientService } from '../../services/client.service';
import { getFirebaseConfigurationError } from '../../utils/firebase-configuration';

@Component({
  selector: 'app-client-entry',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './client-entry.component.html',
  styleUrl: './client-entry.component.scss'
})
export class ClientEntryComponent {
  private fb = inject(FormBuilder);
  private clientService = inject(ClientService);

  submitting = false;
  successMessage = '';
  errorMessage = '';

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    mobile: [''],
    address: [''],
    gstNumber: ['', Validators.required],
    openingBalance: [0],
    isActive: [true]
  });

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
      await this.clientService.createClient(this.form.getRawValue());
      this.successMessage = 'Client created successfully.';
      this.form.reset({
        name: '',
        mobile: '',
        address: '',
        gstNumber: '',
        openingBalance: 0,
        isActive: true
      });
    } catch (err: any) {
      this.errorMessage = err?.message || 'Something went wrong while creating the client.';
    } finally {
      this.submitting = false;
    }
  }
}
