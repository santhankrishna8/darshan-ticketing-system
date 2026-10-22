import { Injectable, computed, inject, signal } from '@angular/core';
import { Unsubscribe } from 'firebase/firestore';
import { Registration } from '../core/models';
import { RegistrationService } from '../core/registration.service';

export interface Row {
  reg: Registration;
  ticketNumber: number;
  name: string;
  age: number;
  gender: string;
  phone: string;
  address: string;
  aadhaarLast4: string;
  coordinator: string;
  paid: boolean;
  scanned: boolean;
}

/** One live subscription to this season's registrations, shared by the staff pages. */
@Injectable({ providedIn: 'root' })
export class StaffDataService {
  private readonly service = inject(RegistrationService);
  private unsub?: Unsubscribe;

  readonly registrations = signal<Registration[] | undefined>(undefined);
  readonly error = signal<string | null>(null);

  readonly rows = computed<Row[]>(() =>
    (this.registrations() ?? []).flatMap(reg =>
      // Whatever is stored, the lists below get plain text and numbers, so one odd record cannot break the page.
      (Array.isArray(reg.members) ? reg.members : []).map(m => ({
        reg,
        ticketNumber: Number(m.ticketNumber),
        name: String(m.name ?? ''),
        age: Number(m.age),
        gender: String(m.gender ?? ''),
        phone: String(m.phone ?? ''),
        address: String(m.address ?? ''),
        aadhaarLast4: String(m.aadhaarLast4 ?? ''),
        coordinator: String(m.coordinator ?? ''),
        paid: m.paymentStatus === 'Paid',
        scanned: !!m.scanned,
      })),
    ),
  );

  start(): void {
    if (this.unsub) return;
    this.unsub = this.service.watchAll(
      regs => this.registrations.set(regs),
      e => this.error.set(e.message),
    );
  }

  stop(): void {
    this.unsub?.();
    this.unsub = undefined;
    this.registrations.set(undefined);
  }
}
