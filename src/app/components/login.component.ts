import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly loginForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  isSubmitting = false;
  errorMessage = '';

  async submit(): Promise<void> {
    if (this.loginForm.invalid || this.isSubmitting) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      const { email, password } = this.loginForm.getRawValue();
      await this.authService.login(email.trim(), password);
      await this.router.navigate(['/home']);
    } catch (error: unknown) {
      this.errorMessage = this.getAuthenticationError(error);
    } finally {
      this.isSubmitting = false;
    }
  }

  private getAuthenticationError(error: unknown): string {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';

    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'The email or password is incorrect.';
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      case 'auth/network-request-failed':
        return 'Unable to connect. Check your internet connection and try again.';
      default:
        return 'Unable to sign in. Please try again.';
    }
  }
}
