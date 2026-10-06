import { FormBuilder } from '@angular/forms';
import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Timestamp } from '@angular/fire/firestore';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ClientService } from '../../services/client.service';
import { TransactionService } from '../../services/transaction.service';
import { TransactionRecord } from '../../models/transaction.model';
import { BillEntryComponent } from './bill-entry.component';

describe('BillEntryComponent Excel billing convention', () => {
  let component: BillEntryComponent;
  let transactionService: jasmine.SpyObj<TransactionService>;
  let clientService: { getClients: jasmine.Spy };

  beforeEach(() => {
    transactionService = jasmine.createSpyObj<TransactionService>('TransactionService', ['createTransaction', 'updateTransaction']);
    transactionService.createTransaction.and.resolveTo('new-transaction-id');
    transactionService.updateTransaction.and.resolveTo();
    clientService = { getClients: jasmine.createSpy('getClients').and.returnValue(of([])) };

    TestBed.configureTestingModule({
      imports: [BillEntryComponent],
      providers: [
        FormBuilder,
        { provide: ClientService, useValue: clientService },
        { provide: TransactionService, useValue: transactionService }
      ]
    });

    component = TestBed.createComponent(BillEntryComponent).componentInstance;
  });

  it('loads and saves a newly created-format transaction without unit conversion', async () => {
    const now = Timestamp.now();
    const transaction: TransactionRecord = {
      id: 'transaction-1',
      clientId: 'client-1',
      billNo: 'B-1',
      transactionDate: now,
      quantity: 3000,
      rate: 99.89,
      grossAmount: 299670,
      discount: 2550,
      netAmount: 297120,
      tdsRate: 0.001,
      tdsAmount: 297.12,
      afterTdsAmount: 296822.88,
      createdAt: now,
      updatedAt: now
    };

    component.transactionToEdit = transaction;
    component.ngOnChanges({ transactionToEdit: new SimpleChange(null, transaction, true) });

    expect(component.form.controls.discountPerLiter.value).toBe(0.85);
    expect(component.form.controls.tdsRate.value).toBe(0.001);
    expect(component.preview.grossAmount).toBe(299670);
    expect(component.preview.discountAmount).toBe(2550);
    expect(component.preview.netAmount).toBe(297120);
    expect(component.preview.tdsAmount).toBe(297.12);
    expect(component.preview.afterTdsAmount).toBe(296822.88);
    expect(transactionService.updateTransaction).not.toHaveBeenCalled();

    await component.submit();

    expect(transactionService.updateTransaction).toHaveBeenCalledOnceWith('transaction-1', jasmine.objectContaining({
      quantity: 3000,
      rate: 99.89,
      discount: 2550,
      tdsRate: 0.001
    }));
  });

  it('rejects negative discount and TDS values without writing', async () => {
    component.form.patchValue({
      billNo: 'B-2',
      clientId: 'client-1',
      quantity: 3000,
      rate: 99.89,
      discountPerLiter: -0.01,
      tdsRate: -0.001
    });

    expect(component.form.controls.discountPerLiter.invalid).toBeTrue();
    expect(component.form.controls.tdsRate.invalid).toBeTrue();

    await component.submit();

    expect(transactionService.createTransaction).not.toHaveBeenCalled();
    expect(transactionService.updateTransaction).not.toHaveBeenCalled();
  });

  it('loads selected client defaults and preserves user overrides when saving a new bill', async () => {
    clientService.getClients.and.returnValue(of([
      { id: 'client-1', name: 'Client One', defaultDiscountPerLiter: 0.85, defaultTdsRate: 0.001 },
      { id: 'client-2', name: 'Client Two', defaultDiscountPerLiter: 1.1, defaultTdsRate: 0.002 }
    ]));
    component.ngOnInit();
    component.form.controls.clientId.setValue('client-1');
    await Promise.resolve();

    expect(component.form.controls.discountPerLiter.value).toBe(0.85);
    expect(component.form.controls.tdsRate.value).toBe(0.001);

    component.form.controls.clientId.setValue('client-2');
    await Promise.resolve();
    expect(component.form.controls.discountPerLiter.value).toBe(1.1);
    expect(component.form.controls.tdsRate.value).toBe(0.002);

    component.form.patchValue({ billNo: 'B-3', quantity: 100, rate: 10, discountPerLiter: 0.5, tdsRate: 0.002 });
    await component.submit();

    expect(transactionService.createTransaction).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      clientId: 'client-2', discount: 50, tdsRate: 0.002
    }));
  });

  it('uses application defaults for an existing client missing stored defaults', async () => {
    clientService.getClients.and.returnValue(of([{ id: 'legacy-client', name: 'Legacy Client' }]));
    component.ngOnInit();
    component.form.controls.clientId.setValue('legacy-client');
    await Promise.resolve();

    expect(component.form.controls.discountPerLiter.value).toBe(environment.defaults.discountPerLiter);
    expect(component.form.controls.tdsRate.value).toBe(environment.defaults.tdsRate);
  });

  it('does not load client defaults into an edited transaction', async () => {
    clientService.getClients.and.returnValue(of([
      { id: 'client-1', name: 'Client One', defaultDiscountPerLiter: 1.5, defaultTdsRate: 0.02 }
    ]));
    component.transactionToEdit = {
      id: 'transaction-1', clientId: 'client-1', billNo: 'B-1', transactionDate: Timestamp.now(),
      quantity: 100, rate: 10, grossAmount: 1000, discount: 25, netAmount: 975, tdsRate: 0.001,
      tdsAmount: 0.98, afterTdsAmount: 974.02, createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    };
    component.ngOnInit();
    component.ngOnChanges({ transactionToEdit: new SimpleChange(null, component.transactionToEdit, true) });
    await Promise.resolve();

    expect(component.form.controls.discountPerLiter.value).toBe(0.25);
    expect(component.form.controls.tdsRate.value).toBe(0.001);

    component.form.patchValue({ billNo: 'B-1', quantity: 100, rate: 10 });
    await component.submit();
    expect(transactionService.updateTransaction).toHaveBeenCalledOnceWith('transaction-1', jasmine.objectContaining({
      discount: 25,
      tdsRate: 0.001
    }));
  });
});
