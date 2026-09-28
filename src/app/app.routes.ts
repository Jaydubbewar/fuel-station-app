import { Routes } from '@angular/router';
import { BillEntryComponent } from './components/bill-entry/bill-entry.component';
import { ClientEntryComponent } from './components/client-entry/client-entry.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';

export const routes: Routes = [
  { path: '', redirectTo: 'new-bill', pathMatch: 'full' },
  { path: 'new-bill', component: BillEntryComponent },
  { path: 'new-client', component: ClientEntryComponent },
  { path: 'dashboard', component: DashboardComponent }
];

