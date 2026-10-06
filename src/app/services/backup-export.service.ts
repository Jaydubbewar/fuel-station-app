import { Injectable, inject } from '@angular/core';
import { Firestore, Timestamp, collection, getDocs } from '@angular/fire/firestore';
import { environment } from '../../environments/environment';

export interface FuelStationBackup {
  backupVersion: 1;
  projectId: string;
  createdAt: string;
  clients: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  payments: Record<string, unknown>[];
}

@Injectable({ providedIn: 'root' })
export class BackupExportService {
  private readonly firestore = inject(Firestore);

  async createBackup(): Promise<FuelStationBackup> {
    const [clients, transactions, payments] = await Promise.all([
      this.readCollection('clients'),
      this.readCollection('transactions'),
      this.readCollection('payments')
    ]);

    return {
      backupVersion: 1,
      projectId: environment.firebase.projectId,
      createdAt: new Date().toISOString(),
      clients,
      transactions,
      payments
    };
  }

  async downloadBackup(): Promise<FuelStationBackup> {
    const backup = await this.createBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `fuel-station-backup-${this.formatFilenameTimestamp(new Date())}.json`;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return backup;
  }

  private async readCollection(collectionName: string): Promise<Record<string, unknown>[]> {
    const snapshot = await getDocs(collection(this.firestore, collectionName));

    return snapshot.docs.map(documentSnapshot => {
      const data = toJsonSafe(documentSnapshot.data()) as Record<string, unknown>;
      const document = { ...data };
      let idField = 'id';

      while (Object.prototype.hasOwnProperty.call(document, idField)) {
        idField = idField === 'id' ? '_firestoreDocumentId' : `${idField}_`;
      }

      document[idField] = documentSnapshot.id;
      return document;
    });
  }

  private formatFilenameTimestamp(date: Date): string {
    const twoDigits = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}-${twoDigits(date.getHours())}${twoDigits(date.getMinutes())}${twoDigits(date.getSeconds())}`;
  }
}

function toJsonSafe(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, fieldValue]) => [key, toJsonSafe(fieldValue)])
    );
  }

  return value;
}
