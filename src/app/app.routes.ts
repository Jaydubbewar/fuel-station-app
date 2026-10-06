import { Routes } from '@angular/router';
import { BillEntryComponent } from './components/bill-entry/bill-entry.component';
import { ClientManagementComponent } from './components/client-management/client-management.component';
import { ClientEntryComponent } from './components/client-entry/client-entry.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { PaymentEntryComponent } from './components/payment-entry/payment-entry.component';
import { LoginComponent } from './components/login.component';
import { HomeComponent } from './components/home/home.component';
import { authenticatedGuard, unauthenticatedGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [unauthenticatedGuard] },
  {
    path: '',
    canActivateChild: [authenticatedGuard],
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'home', component: HomeComponent },
      { path: 'new-bill', component: BillEntryComponent },
      { path: 'new-payment', component: PaymentEntryComponent },
      { path: 'new-client', component: ClientEntryComponent },
      { path: 'clients', component: ClientManagementComponent },
      { path: 'clients/:id/edit', component: ClientEntryComponent },
      { path: 'dashboard', component: DashboardComponent },
      { path: '**', redirectTo: 'home' }
    ]
  }
];

