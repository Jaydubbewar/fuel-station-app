import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from './services/auth.service';
import { BackupExportService } from './services/backup-export.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AsyncPipe, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {

  title = 'fuel-station-app';
  private readonly authService = inject(AuthService);
  private readonly backupExportService = inject(BackupExportService);
  private readonly router = inject(Router);
  readonly user$ = this.authService.user$;
  isMenuOpen = false;
  isExporting = false;
  exportSuccess = '';
  exportError = '';

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  closeMenu(): void {
    this.isMenuOpen = false;
  }

  async exportBackup(): Promise<void> {
    if (this.isExporting) {
      return;
    }

    if (!window.confirm('Export a full backup of clients, transactions, and payments?')) {
      return;
    }

    this.isExporting = true;
    this.exportSuccess = '';
    this.exportError = '';

    try {
      const backup = await this.backupExportService.downloadBackup();
      this.exportSuccess = `Backup downloaded: ${backup.clients.length} clients, ${backup.transactions.length} transactions, ${backup.payments.length} payments.`;
    } catch {
      this.exportError = 'Backup export failed. Check your connection and permissions, then try again.';
    } finally {
      this.isExporting = false;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.authService.logout();
      await this.router.navigate(['/login']);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

}
