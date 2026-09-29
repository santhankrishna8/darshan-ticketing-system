import { Component, ElementRef, computed, effect, inject, signal, untracked, viewChildren } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AadhaarScannerService } from '../../aadhaar/aadhaar-scanner.service';
import { AadhaarDetails, ageFrom, formatAadhaar } from '../../aadhaar/aadhaar.types';
import { isValidAadhaar } from '../../aadhaar/verhoeff';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../core/firebase-auth';
import { MemberInput, Registration, SeasonSettings } from '../../core/models';
import { RegistrationError, RegistrationService } from '../../core/registration.service';
import { SeasonService } from '../../core/season.service';
import { downloadTicketPdf } from '../../core/ticket-pdf';
import { SiteFooterComponent } from '../../shared/site-footer';
import { SiteHeaderComponent } from '../../shared/site-header';
import { ToastService } from '../../shared/toast';

type ScanState = 'idle' | 'scanning' | 'ok' | 'partial' | 'failed';
type Field = 'name' | 'aadhaar' | 'age' | 'gender' | 'phone' | 'address';

function aadhaarValidator(c: AbstractControl): ValidationErrors | null {
  const digits = String(c.value ?? '').replace(/\D/g, '');
  if (!digits) return null; // "required" reports the empty case
  if (digits.length !== 12) return { length: true };
  return isValidAadhaar(digits) ? null : { checksum: true };
}

class MemberRow {
  private static nextId = 1;
  readonly id = MemberRow.nextId++;
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    aadhaar: new FormControl('', { nonNullable: true, validators: [Validators.required, aadhaarValidator] }),
    age: new FormControl<number | null>(null, { validators: [Validators.required] }),
    gender: new FormControl<'' | 'Male' | 'Female' | 'Transgender'>('', { nonNullable: true, validators: [Validators.required] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)] }),
    address: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] }),
  });
  dob = '';
  readonly scan = signal<ScanState>('idle');
  readonly missing = signal<string[]>([]);
  readonly fromCard = signal<Set<Field>>(new Set());
  readonly duplicate = signal<'unknown' | 'checking' | 'free' | 'taken'>('unknown');

  constructor(settings: SeasonSettings, prev?: MemberRow) {
    this.form.controls.age.addValidators([Validators.min(settings.minAge), Validators.max(settings.maxAge)]);
    // Families usually share a phone number and address.
    if (prev) this.form.patchValue({ phone: prev.form.controls.phone.value, address: prev.form.controls.address.value });
  }

  get scanned(): boolean {
    return this.fromCard().size > 0;
  }
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, SiteHeaderComponent, SiteFooterComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
  protected readonly season = inject(SeasonService);
  protected readonly scanner = inject(AadhaarScannerService);
  private readonly registrations = inject(RegistrationService);
  private readonly toast = inject(ToastService);
  private readonly cards = viewChildren<ElementRef<HTMLElement>>('card');

  protected readonly rows = signal<MemberRow[]>([]);
  protected readonly submitting = signal(false);
  protected readonly attempted = signal(false);
  protected readonly done = signal<Registration | null>(null);
  protected readonly submitError = signal<string | null>(null);
  /** Signed-in staff may register walk-in devotees even while public registration is closed. */
  private readonly signedIn = signal(false);
  protected readonly scanningAny = computed(() => this.rows().some(r => r.scan() === 'scanning'));

  protected readonly state = computed<'loading' | 'not-ready' | 'closed' | 'full' | 'open'>(() => {
    const s = this.season.settings();
    if (s === undefined) return 'loading';
    if (!s || !this.season.counter()) return 'not-ready';
    if (this.season.ticketsLeft() <= 0) return 'full';
    if (!s.registrationOpen && !this.signedIn()) return 'closed';
    return 'open';
  });

  protected readonly maxRows = computed(() => Math.min(this.season.settings()?.maxPerGroup ?? 10, this.season.ticketsLeft()));
  protected readonly formatAadhaar = formatAadhaar;

  constructor() {
    onAuthStateChanged(auth, user => this.signedIn.set(!!user));
    effect(() => {
      const s = this.season.settings();
      if (s && untracked(this.rows).length === 0) this.rows.set([new MemberRow(s)]);
    });
  }

  protected addRow(): void {
    const s = this.season.settings();
    if (!s || this.rows().length >= this.maxRows()) return;
    const rows = this.rows();
    this.rows.set([...rows, new MemberRow(s, rows[rows.length - 1])]);
    setTimeout(() => this.cards().at(-1)?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected removeRow(row: MemberRow): void {
    this.rows.update(rows => rows.filter(r => r !== row));
  }

  protected pickPhoto(input: HTMLInputElement): void {
    this.scanner.warmUp();
    input.value = '';
    input.click();
  }

  protected async onPhoto(row: MemberRow, event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    row.scan.set('scanning');
    row.missing.set([]);
    try {
      const result = await this.scanner.scan(file);
      this.apply(row, result.details);
      const missing: string[] = [];
      if (!result.details.name) missing.push('name / పేరు');
      if (!result.details.aadhaar || !result.aadhaarVerified) missing.push('Aadhaar number / ఆధార్ నంబర్');
      if (row.form.controls.age.value == null) missing.push('age / వయసు');
      row.missing.set(missing);
      row.scan.set(result.filled.length === 0 ? 'failed' : missing.length ? 'partial' : 'ok');
    } catch (e) {
      console.error('Scan failed', e);
      row.scan.set('failed');
    }
  }

  private apply(row: MemberRow, d: AadhaarDetails): void {
    const c = row.form.controls;
    const filled = new Set<Field>();
    const set = <K extends Field>(key: K, value: unknown) => {
      if (value === undefined || value === null || value === '') return;
      (c[key] as FormControl).setValue(value);
      (c[key] as FormControl).markAsTouched();
      filled.add(key);
    };
    set('name', d.name);
    set('aadhaar', d.aadhaar ? formatAadhaar(d.aadhaar) : undefined);
    set('age', ageFrom(d));
    set('gender', d.gender);
    set('phone', d.phone);
    set('address', d.address);
    row.dob = d.dob ?? (d.yearOfBirth ? String(d.yearOfBirth) : '');
    row.fromCard.set(filled);
    if (d.aadhaar) this.checkDuplicate(row);
  }

  /** Typing into a field means the person has checked it: drop the "from card" highlight. */
  protected edited(row: MemberRow, field: Field): void {
    if (!row.fromCard().has(field)) return;
    const next = new Set(row.fromCard());
    next.delete(field);
    row.fromCard.set(next);
  }

  protected onAadhaarInput(row: MemberRow, el: HTMLInputElement): void {
    const formatted = formatAadhaar(el.value);
    if (formatted !== el.value) row.form.controls.aadhaar.setValue(formatted);
    row.duplicate.set('unknown');
    this.edited(row, 'aadhaar');
    if (row.form.controls.aadhaar.valid) this.checkDuplicate(row);
  }

  protected async checkDuplicate(row: MemberRow): Promise<void> {
    const digits = row.form.controls.aadhaar.value.replace(/\D/g, '');
    if (!isValidAadhaar(digits)) return;
    const others = this.rows().filter(r => r !== row && r.form.controls.aadhaar.value.replace(/\D/g, '') === digits);
    if (others.length) {
      row.duplicate.set('taken');
      return;
    }
    row.duplicate.set('checking');
    try {
      const taken = await this.registrations.isRegistered(digits);
      if (row.form.controls.aadhaar.value.replace(/\D/g, '') === digits) row.duplicate.set(taken ? 'taken' : 'free');
    } catch {
      row.duplicate.set('unknown');
    }
  }

  protected show(row: MemberRow, field: Field): boolean {
    const c = row.form.controls[field];
    return c.invalid && (c.touched || this.attempted());
  }

  protected async submit(): Promise<void> {
    this.attempted.set(true);
    this.submitError.set(null);
    const rows = this.rows();
    rows.forEach(r => r.form.markAllAsTouched());
    const firstBad = rows.findIndex(r => r.form.invalid || r.duplicate() === 'taken');
    if (firstBad >= 0) {
      this.cards()[firstBad]?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.toast.show('Please fix the highlighted details · గుర్తించిన వివరాలు సరిచేయండి', 'error');
      return;
    }

    const members: MemberInput[] = rows.map(r => {
      const v = r.form.getRawValue();
      return {
        name: v.name,
        aadhaar: v.aadhaar.replace(/\D/g, ''),
        age: Number(v.age),
        gender: v.gender,
        dob: r.dob,
        phone: v.phone,
        address: v.address,
        scanned: r.scanned,
      };
    });

    this.submitting.set(true);
    try {
      const reg = await this.registrations.register(members, auth.currentUser?.uid ?? null);
      this.done.set(reg);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.download(reg);
    } catch (e: any) {
      console.error(e);
      if (e instanceof RegistrationError && e.code === 'duplicate') {
        for (const r of rows) if (e.aadhaars.includes(r.form.controls.aadhaar.value.replace(/\D/g, ''))) r.duplicate.set('taken');
        this.submitError.set('Some Aadhaar numbers are already registered. Remove them or download the existing ticket.');
      } else if (e instanceof RegistrationError) {
        this.submitError.set(e.message);
      } else if (e?.code === 'permission-denied') {
        this.submitError.set('Registration is not open right now. Please contact the organisers.');
      } else if (e?.code === 'unavailable') {
        this.submitError.set('No internet connection. Your details are still here: please try again.');
      } else {
        this.submitError.set('Something went wrong. Please try again.');
      }
    } finally {
      this.submitting.set(false);
    }
  }

  protected async download(reg: Registration): Promise<void> {
    const s = this.season.settings();
    if (!s) return;
    try {
      await downloadTicketPdf(reg, s);
    } catch (e) {
      console.error(e);
      this.toast.show('Could not create the PDF. Please try the download button again.', 'error');
    }
  }

  protected startOver(): void {
    this.done.set(null);
    this.attempted.set(false);
    const s = this.season.settings();
    this.rows.set(s ? [new MemberRow(s)] : []);
  }
}
