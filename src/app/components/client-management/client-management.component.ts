import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ClientRecord } from '../../models/client.model';
import { BackupExportService } from '../../services/backup-export.service';
import { ClientService } from '../../services/client.service';

@Component({
  selector: 'app-client-management',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './client-management.component.html',
  styleUrl: './client-management.component.scss'
})
export class ClientManagementComponent implements OnInit {
  private clientService = inject(ClientService);
  private backupExportService = inject(BackupExportService);

  clients$!: Observable<ClientRecord[]>;
  deactivatingClientId: string | null = null;
  reactivatingClientId: string | null = null;
  pendingDeactivationClient: ClientRecord | null = null;
  successMessage = '';
  errorMessage = '';

  ngOnInit(): void {
    this.clients$ = this.clientService.getAllClients();
  }

  requestDeactivation(client: ClientRecord): void {
    this.successMessage = '';
    this.errorMessage = '';
    this.pendingDeactivationClient = client;
  }

  cancelDeactivation(): void {
    this.pendingDeactivationClient = null;
  }

  async deactivateClient(withBackup: boolean): Promise<void> {
    const client = this.pendingDeactivationClient;
    if (!client) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.deactivatingClientId = client.id;
    try {
      if (withBackup) {
        await this.backupExportService.downloadBackup();
      }
      await this.clientService.deactivateClient(client.id);
      this.pendingDeactivationClient = null;
      this.successMessage = withBackup
        ? `${client.name} was deactivated after the backup downloaded.`
        : `${client.name} was deactivated without exporting a backup.`;
    } catch (err: any) {
      this.errorMessage = withBackup
        ? err?.message || 'Unable to export a backup or deactivate the client.'
        : err?.message || 'Unable to deactivate the client.';
    } finally {
      this.deactivatingClientId = null;
    }
  }

  async reactivateClient(client: ClientRecord): Promise<void> {
    if (!window.confirm(`Reactivate ${client.name}? It will be available in active client lists again.`)) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.reactivatingClientId = client.id;
    try {
      await this.clientService.reactivateClient(client.id);
      this.successMessage = `${client.name} was reactivated.`;
    } catch (err: any) {
      this.errorMessage = err?.message || 'Unable to reactivate the client.';
    } finally {
      this.reactivatingClientId = null;
    }
  }
}
