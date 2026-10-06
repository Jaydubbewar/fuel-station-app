import { FormBuilder } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { Timestamp } from '@angular/fire/firestore';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ClientService } from '../../services/client.service';
import { TransactionService } from '../../services/transaction.service';
import { ClientEntryComponent } from './client-entry.component';

describe('ClientEntryComponent billing defaults', () => {
  let component: ClientEntryComponent;
  let clientService: jasmine.SpyObj<ClientService>;
  let transactionService: jasmine.SpyObj<TransactionService>;
  let clientId: string | null;

  beforeEach(() => {
    clientId = null;
    clientService = jasmine.createSpyObj<ClientService>('ClientService', ['getClient', 'createClient', 'updateClient']);
    clientService.getClient.and.returnValue(of(undefined));
    clientService.createClient.and.resolveTo('new-client-id');
    clientService.updateClient.and.resolveTo();
    transactionService = jasmine.createSpyObj<TransactionService>('TransactionService', ['createTransaction', 'updateTransaction']);

    TestBed.configureTestingModule({
      imports: [ClientEntryComponent],
      providers: [
        FormBuilder,
        { provide: ClientService, useValue: clientService },
        { provide: TransactionService, useValue: transactionService },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => clientId } } } }
      ]
    });

    component = TestBed.createComponent(ClientEntryComponent).componentInstance;
  });

  it('saves default billing terms when creating a client', async () => {
    component.form.patchValue({
      name: 'Client One', defaultDiscountPerLiter: 0.85, defaultTdsRate: 0.001
    });

    await component.submit();

    expect(clientService.createClient).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      defaultDiscountPerLiter: 0.85,
      defaultTdsRate: 0.001
    }));
  });

  it('loads application defaults for legacy clients and changes client defaults without modifying transactions', async () => {
    clientId = 'legacy-client';
    clientService.getClient.and.returnValue(of({
      id: 'legacy-client', name: 'Legacy Client', openingBalance: 0, openingBalanceDate: Timestamp.now(),
      isActive: true, createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    }));
    component.isEditMode = true;
    await (component as any).loadClient(clientId);

    expect(component.form.controls.defaultDiscountPerLiter.value).toBe(environment.defaults.discountPerLiter);
    expect(component.form.controls.defaultTdsRate.value).toBe(environment.defaults.tdsRate);

    component.form.patchValue({ defaultDiscountPerLiter: 1.2, defaultTdsRate: 0.002 });
    await component.submit();

    expect(clientService.updateClient).toHaveBeenCalledOnceWith('legacy-client', jasmine.objectContaining({
      defaultDiscountPerLiter: 1.2,
      defaultTdsRate: 0.002
    }));
    expect(clientService.createClient).not.toHaveBeenCalled();
    expect(transactionService.createTransaction).not.toHaveBeenCalled();
    expect(transactionService.updateTransaction).not.toHaveBeenCalled();
  });
});
