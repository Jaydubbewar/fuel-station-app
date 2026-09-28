import { environment } from '../../environments/environment';

export function getFirebaseConfigurationError(): string | null {
  const hasPlaceholder = Object.values(environment.firebase).some((value) => value.startsWith('YOUR_'));

  return hasPlaceholder
    ? 'Firebase is not configured. Add your Firebase project credentials in src/environments/environment.ts and environment.prod.ts.'
    : null;
}
