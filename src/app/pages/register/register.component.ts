import { Component, ElementRef, OnDestroy, computed, effect, inject, signal, untracked, viewChild, viewChildren } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AadhaarScannerService } from '../../aadhaar/aadhaar-scanner.service';
import { AadhaarDetails, ageFrom, formatAadhaar, maskAadhaar } from '../../aadhaar/aadhaar.types';
import { isValidAadhaar } from '../../aadhaar/verhoeff';
import { MAX_PER_REGISTRATION, MemberInput, Registration, SeasonSettings } from '../../core/models';
import { RegistrationError, RegistrationService } from '../../core/registration.service';
import { SeasonService } from '../../core/season.service';
import { downloadTicketPdf } from '../../core/ticket-pdf';
import { AadhaarNoticeComponent } from '../../shared/aadhaar-notice';
import { IconComponent } from '../../shared/icon';
import { I18nService } from '../../shared/i18n.service';
import { SiteHeaderComponent } from '../../shared/site-header';
import { ToastService } from '../../shared/toast';
import { TourService, TourStep } from '../../shared/tour';

type ScanState = 'idle' | 'scanning' | 'ok' | 'partial' | 'failed';
type Field = 'name' | 'aadhaar' | 'age' | 'gender' | 'phone' | 'address';
/** Unsent form, kept for this tab only so a refresh does not lose it (cleared on submit). */
const DRAFT = 'register.draft';
type Draft = { values: MemberRow['form']['value']; dob: string; fromCard: Field[] }[];

function aadhaarValidator(c: AbstractControl): ValidationErrors | null {
  const digits = String(c.value ?? '').replace(/\D/g, '');
  if (!digits) return null; // "required" reports the empty case
  if (digits.length !== 12) return { length: true };
  return isValidAadhaar(digits) ? null : { checksum: true };
}

/** At least `n` characters once the spaces at both ends are removed (the saved value is trimmed). */
const trimmedMin =
  (n: number) =>
  (c: AbstractControl): ValidationErrors | null =>
    String(c.value ?? '').trim().length >= n ? null : { minlength: true };

function wholeNumber(c: AbstractControl): ValidationErrors | null {
  return c.value == null || c.value === '' || Number.isInteger(Number(c.value)) ? null : { integer: true };
}

class MemberRow {
  private static nextId = 1;
  readonly id = MemberRow.nextId++;
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, trimmedMin(2), Validators.maxLength(100)] }),
    aadhaar: new FormControl('', { nonNullable: true, validators: [Validators.required, aadhaarValidator] }),
    age: new FormControl<number | null>(null, { validators: [Validators.required, wholeNumber] }),
    gender: new FormControl<'' | 'Male' | 'Female' | 'Transgender'>('', { nonNullable: true, validators: [Validators.required] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)] }),
    address: new FormControl('', { nonNullable: true, validators: [Validators.required, trimmedMin(3), Validators.maxLength(500)] }),
  });
  dob = '';
  readonly scan = signal<ScanState>('idle');
  readonly missing = signal<string[]>([]);
  readonly fromCard = signal<Set<Field>>(new Set());
  /** Live "already registered" check, like a username check: taken = registered before, repeat = twice in this form. */
  readonly duplicate = signal<'unknown' | 'checking' | 'free' | 'taken' | 'repeat' | 'error'>('unknown');
  readonly takenTicket = signal<number | null>(null);
  readonly repeatOf = signal<number | null>(null);

  constructor(settings: SeasonSettings, prev?: MemberRow) {
    this.form.controls.age.addValidators([Validators.min(settings.minAge), Validators.max(settings.maxAge)]);
    // Families usually share a phone number; the address comes from each person's own card.
    if (prev) this.form.patchValue({ phone: prev.form.controls.phone.value });
  }

  get scanned(): boolean {
    return this.fromCard().size > 0;
  }
}

const TOUR: TourStep[] = [
  {
    target: '[data-tour=scan]',
    title: 'Scan the Aadhaar card',
    titleTe: 'ఆధార్ స్కాన్',
    body: 'Tap here and take a photo of the card, front or letter. Keep it flat, in good light, filling the frame.',
    bodyTe: 'ఇక్కడ నొక్కి కార్డు ఫోటో తీయండి. వెలుతురులో, కార్డు మొత్తం కనిపించేలా.',
  },
  {
    target: '[data-tour=choose]',
    title: 'Or pick a saved photo',
    titleTe: 'లేదా ఫోటో ఎంచుకోండి',
    body: 'Already have a photo or a downloaded e-Aadhaar? Choose it from the gallery.',
    bodyTe: 'ఫోన్‌లో ఉన్న ఫోటోను కూడా ఎంచుకోవచ్చు.',
  },
  {
    target: '[data-tour=fields]',
    title: 'Check the details',
    titleTe: 'వివరాలు సరిచూడండి',
    body: 'Details read from the card are highlighted in yellow. Correct anything that is wrong, or type everything yourself.',
    bodyTe: 'కార్డు నుండి వచ్చిన వివరాలు పసుపు రంగులో ఉంటాయి. తప్పు ఉంటే సరిచేయండి.',
  },
  {
    target: '[data-tour=add]',
    title: 'Add family members',
    titleTe: 'కుటుంబ సభ్యులు',
    body: 'Add everyone who is coming. The phone number is copied from the previous person.',
    bodyTe: 'వచ్చే అందరినీ జోడించండి. ఫోన్ నంబర్ ముందు వ్యక్తి నుండి వస్తుంది.',
  },
  {
    target: '[data-tour=submit]',
    title: 'Submit and get the ticket',
    titleTe: 'సమర్పించండి',
    body: 'Submit to get ticket numbers, then download the ticket PDF. Pay the fee at the temple.',
    bodyTe: 'సమర్పిస్తే టికెట్ నంబర్లు వస్తాయి, తర్వాత టికెట్ PDF డౌన్‌లోడ్ చేసుకోండి. రుసుము మందిరంలో చెల్లించండి.',
  },
  {
    target: '[data-tour=settings]',
    title: 'Settings',
    titleTe: 'సెట్టింగ్స్',
    body: 'Switch between English and Telugu, or see this tour again.',
    bodyTe: 'ఇంగ్లీష్ / తెలుగు మార్చుకోవచ్చు లేదా ఈ వివరణ మళ్ళీ చూడవచ్చు.',
  },
];

@Component({
  selector: 'app-register',
  imports: [NgTemplateOutlet, ReactiveFormsModule, RouterLink, SiteHeaderComponent, IconComponent, AadhaarNoticeComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent implements OnDestroy {
  protected readonly season = inject(SeasonService);
  protected readonly scanner = inject(AadhaarScannerService);
  protected readonly i18n = inject(I18nService);
  /** Inside the seva desk the admin sidebar replaces the public header. */
  protected readonly embedded = !!inject(ActivatedRoute).snapshot.data['embedded'];
  private readonly registrations = inject(RegistrationService);
  private readonly toast = inject(ToastService);
  private readonly tour = inject(TourService);
  private readonly cards = viewChildren<ElementRef<HTMLElement>>('card');

  protected readonly rows = signal<MemberRow[]>([]);
  protected readonly submitting = signal(false);
  protected readonly attempted = signal(false);
  protected readonly done = signal<Registration | null>(null);
  protected readonly submitError = signal<string | null>(null);
  protected readonly scanningAny = computed(() => this.rows().some(r => r.scan() === 'scanning'));

  protected readonly state = computed<'loading' | 'not-ready' | 'closed' | 'full' | 'open'>(() => {
    const s = this.season.settings();
    if (s === undefined) return 'loading';
    if (!s || !this.season.counter()) return 'not-ready';
    if (this.season.ticketsLeft() <= 0) return 'full';
    // Inside the seva desk (staff only) walk-in devotees can be registered even while public registration is closed.
    if (!s.registrationOpen && !this.embedded) return 'closed';
    return 'open';
  });

  protected readonly maxRows = computed(() =>
    Math.max(1, Math.min(this.season.settings()?.maxPerGroup ?? MAX_PER_REGISTRATION, MAX_PER_REGISTRATION, this.season.ticketsLeft())),
  );
  protected readonly formatAadhaar = formatAadhaar;

  constructor() {
    effect(() => {
      const s = this.season.settings();
      if (s && untracked(this.rows).length === 0) this.rows.set(this.restore(s) ?? [new MemberRow(s)]);
    });
    // Offer the walkthrough once the form is actually on screen.
    effect(() => {
      // Public visitors get the "how it works" row instead of an overlay; the tour stays under Settings.
      if (this.state() === 'open' && !this.done()) untracked(() => this.tour.offer('register', TOUR, this.embedded));
      else untracked(() => this.tour.withdraw('register'));
    });
  }

  ngOnDestroy(): void {
    this.closeCamera();
    this.tour.withdraw('register');
  }

  protected addRow(): void {
    const s = this.season.settings();
    if (!s || this.rows().length >= this.maxRows()) return;
    const rows = this.rows();
    this.rows.set([...rows, new MemberRow(s, rows[rows.length - 1])]);
    this.save();
    setTimeout(() => this.cards().at(-1)?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected removeRow(row: MemberRow): void {
    this.rows.update(rows => rows.filter(r => r !== row));
    this.save();
  }

  protected save(): void {
    // The form's last "change" event can arrive as the form is removed after a successful submit; it must not
    // bring the cleared draft (with the family's Aadhaar numbers) back.
    if (this.done()) return;
    const draft: Draft = this.rows().map(r => ({ values: r.form.getRawValue(), dob: r.dob, fromCard: [...r.fromCard()] }));
    try {
      sessionStorage.setItem(DRAFT, JSON.stringify(draft));
    } catch {
      /* private mode: a refresh starts over */
    }
  }

  private restore(s: SeasonSettings): MemberRow[] | null {
    try {
      const draft: Draft = JSON.parse(sessionStorage.getItem(DRAFT) ?? 'null');
      if (!draft?.length) return null;
      const rows = draft.slice(0, Math.min(s.maxPerGroup || MAX_PER_REGISTRATION, MAX_PER_REGISTRATION)).map(d => {
        const row = new MemberRow(s);
        row.form.patchValue(d.values);
        row.dob = d.dob;
        row.fromCard.set(new Set(d.fromCard));
        return row;
      });
      setTimeout(() => rows.forEach(r => r.form.controls.aadhaar.value && this.checkDuplicate(r)));
      return rows;
    } catch {
      return null;
    }
  }

  private clearDraft(): void {
    try {
      sessionStorage.removeItem(DRAFT);
    } catch {}
  }

  // Live camera, so the back camera is used: a file input's camera app reopens on whichever
  // camera was used last, often the selfie one.
  private readonly camDialog = viewChild<ElementRef<HTMLDialogElement>>('camDialog');
  private readonly camVideo = viewChild<ElementRef<HTMLVideoElement>>('camVideo');
  private camStream?: MediaStream;
  private camRow?: MemberRow;

  protected async openCamera(row: MemberRow, fallback: HTMLInputElement): Promise<void> {
    this.scanner.warmUp();
    try {
      this.camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        audio: false,
      });
    } catch {
      this.pickPhoto(fallback); // no camera permission or no getUserMedia: use the phone's camera app
      return;
    }
    this.camRow = row;
    const video = this.camVideo()!.nativeElement;
    video.srcObject = this.camStream;
    this.camDialog()!.nativeElement.showModal();
    await video.play().catch(() => {});
  }

  protected capture(): void {
    const video = this.camVideo()?.nativeElement;
    const row = this.camRow;
    if (!video?.videoWidth || !row) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    this.closeCamera();
    canvas.toBlob(blob => blob && this.scan(row, blob), 'image/jpeg', 0.95);
  }

  protected closeCamera(): void {
    this.camStream?.getTracks().forEach(t => t.stop());
    this.camStream = undefined;
    this.camRow = undefined;
    const dialog = this.camDialog()?.nativeElement;
    if (dialog?.open) dialog.close();
  }

  protected pickPhoto(input: HTMLInputElement): void {
    this.scanner.warmUp();
    input.value = '';
    input.click();
  }

  protected async onPhoto(row: MemberRow, event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) await this.scan(row, file);
  }

  private async scan(row: MemberRow, file: Blob): Promise<void> {
    row.scan.set('scanning');
    row.missing.set([]);
    try {
      const result = await this.scanner.scan(file);
      this.apply(row, result.details);
      const missing: string[] = [];
      const t = (en: string, te: string) => this.i18n.t(en, te);
      if (!result.details.name) missing.push(t('name', 'పేరు'));
      if (!result.details.aadhaar || !result.aadhaarVerified) missing.push(t('Aadhaar number', 'ఆధార్ నంబర్'));
      if (row.form.controls.age.value == null) missing.push(t('age', 'వయసు'));
      row.missing.set(missing);
      row.scan.set(result.filled.length === 0 ? 'failed' : missing.length ? 'partial' : 'ok');
      this.save();
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

  protected readonly mask = maskAadhaar;

  protected onAadhaarInput(row: MemberRow, el: HTMLInputElement): void {
    const formatted = formatAadhaar(el.value);
    if (formatted !== el.value) row.form.controls.aadhaar.setValue(formatted);
    row.duplicate.set('unknown');
    this.edited(row, 'aadhaar');
    // Re-check every row: changing one number can create or clear a repeat elsewhere in the form.
    for (const r of this.rows()) if (r === row || r.duplicate() === 'repeat') this.checkDuplicate(r);
  }

  protected async checkDuplicate(row: MemberRow): Promise<void> {
    const digits = row.form.controls.aadhaar.value.replace(/\D/g, '');
    if (!isValidAadhaar(digits)) {
      row.duplicate.set('unknown');
      return;
    }
    const rows = this.rows();
    const first = rows.findIndex(r => r.form.controls.aadhaar.value.replace(/\D/g, '') === digits);
    if (rows[first] !== row) {
      row.repeatOf.set(first + 1);
      row.duplicate.set('repeat');
      return;
    }
    row.duplicate.set('checking');
    try {
      const ticket = await this.registrations.registeredTicket(digits);
      if (row.form.controls.aadhaar.value.replace(/\D/g, '') !== digits) return; // typed on meanwhile
      row.takenTicket.set(ticket);
      row.duplicate.set(ticket === null ? 'free' : 'taken');
    } catch (e) {
      console.error('Aadhaar check failed', e);
      if (row.form.controls.aadhaar.value.replace(/\D/g, '') === digits) row.duplicate.set('error');
    }
  }

  /** Aadhaar errors show as soon as all 12 digits are in, without waiting for the field to lose focus. */
  protected showAadhaarError(row: MemberRow): boolean {
    const c = row.form.controls.aadhaar;
    return c.invalid && (c.touched || this.attempted() || c.value.replace(/\D/g, '').length === 12);
  }


  protected show(row: MemberRow, field: Field): boolean {
    const c = row.form.controls[field];
    return c.invalid && (c.touched || this.attempted());
  }

  protected needsFix(row: MemberRow): boolean {
    return row.form.invalid || row.duplicate() === 'taken' || row.duplicate() === 'repeat';
  }

  /** Jump to the first field that needs fixing (after the error styles have rendered). */
  private pointAtProblem(): void {
    setTimeout(() => this.cards().find(c => c.nativeElement.querySelector('.invalid'))?.nativeElement.querySelector<HTMLElement>('.invalid')?.focus());
  }

  protected async submit(): Promise<void> {
    this.attempted.set(true);
    this.submitError.set(null);
    const rows = this.rows();
    rows.forEach(r => r.form.markAllAsTouched());
    const bad = rows.flatMap((r, i) => (this.needsFix(r) ? [i + 1] : []));
    if (bad.length) {
      this.pointAtProblem();
      this.toast.show(this.i18n.t('Please fix the highlighted details: Devotee ', 'గుర్తించిన వివరాలు సరిచేయండి: భక్తుడు ') + bad.join(', '), 'error');
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
      // Staff are recorded against their registrations. The sign-in code is only loaded inside the seva desk.
      const createdBy = this.embedded ? ((await import('../../core/firebase-auth')).auth.currentUser?.uid ?? null) : null;
      const reg = await this.registrations.register(members, createdBy);
      this.done.set(reg);
      this.clearDraft();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      console.error(e);
      if (e instanceof RegistrationError && e.code === 'duplicate') {
        for (const r of rows) if (e.aadhaars.includes(r.form.controls.aadhaar.value.replace(/\D/g, ''))) r.duplicate.set('taken');
        this.pointAtProblem();
        this.submitError.set(this.i18n.t('Some Aadhaar numbers are already registered. Remove them or download the existing ticket.', 'కొన్ని ఆధార్ నంబర్లు ఇప్పటికే నమోదయ్యాయి. వాటిని తొలగించండి లేదా పాత టికెట్ డౌన్‌లోడ్ చేసుకోండి.'));
      } else if (e instanceof RegistrationError) {
        const left = e.message.match(/\d+/)?.[0] ?? '0';
        const t = (en: string, te: string) => this.i18n.t(en, te);
        this.submitError.set(
          e.code === 'sold-out' ? t(`Only ${left} tickets are left.`, `${left} టికెట్లు మాత్రమే మిగిలి ఉన్నాయి.`)
          : e.code === 'closed' ? t('Registration is closed.', 'నమోదు ముగిసింది.')
          : t('Registration has not started yet.', 'నమోదు ఇంకా ప్రారంభం కాలేదు.'),
        );
      } else if (e?.code === 'permission-denied') {
        // Either registration was closed meanwhile, or the server did not accept a detail (too long, wrong format).
        this.submitError.set(
          this.season.settings()?.registrationOpen === false && !this.embedded
            ? this.i18n.t('Registration is not open right now.', 'ప్రస్తుతం నమోదు అందుబాటులో లేదు.')
            : this.i18n.t('Could not save just now. Many people may be registering at once, so please press Submit again. If it keeps happening, check the name, phone number and address.', 'ఇప్పుడు సేవ్ కాలేదు. చాలామంది ఒకేసారి నమోదు చేస్తుండవచ్చు, మళ్ళీ సమర్పించండి. అయినా కాకపోతే పేరు, ఫోన్ నంబర్, చిరునామా సరిచూడండి.'),
        );
      } else if (e?.code === 'unavailable') {
        this.submitError.set(this.i18n.t('No internet connection. Your details are still here, please try again.', 'ఇంటర్నెట్ లేదు. వివరాలు అలాగే ఉన్నాయి, మళ్ళీ ప్రయత్నించండి.'));
      } else {
        this.submitError.set(this.i18n.t('Something went wrong. Please try again.', 'ఏదో పొరపాటు జరిగింది. మళ్ళీ ప్రయత్నించండి.'));
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
      this.toast.show(this.i18n.t('Could not create the PDF. Please try again.', 'PDF తయారు కాలేదు. మళ్ళీ ప్రయత్నించండి.'), 'error');
    }
  }

  protected startOver(): void {
    this.done.set(null);
    this.attempted.set(false);
    const s = this.season.settings();
    this.rows.set(s ? [new MemberRow(s)] : []);
    this.clearDraft();
  }
}
