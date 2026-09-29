import { Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Gender, formatAadhaar } from '../../aadhaar/aadhaar.types';
import { isValidAadhaar } from '../../aadhaar/verhoeff';
import { AuthService } from '../../core/auth.service';
import { RegistrationError, RegistrationService } from '../../core/registration.service';
import { SeasonService } from '../../core/season.service';
import { IconComponent } from '../../shared/icon';
import { ToastService } from '../../shared/toast';
import { Row } from '../staff-data.service';

interface Draft {
  name: string;
  age: number | null;
  gender: Gender | '';
  phone: string;
  address: string;
  aadhaar: string;
}

/** Edit one devotee of a registration. Admins can also correct the Aadhaar number. */
@Component({
  selector: 'app-edit-member',
  imports: [FormsModule, IconComponent],
  template: `
    <dialog #dialog (click)="backdrop($event)">
      @if (row(); as r) {
        <form class="sheet" (ngSubmit)="save(r)" #f="ngForm">
          <header>
            <h2>Edit ticket {{ r.ticketNumber }}</h2>
            <button type="button" class="btn btn-ghost btn-sm" (click)="close()" aria-label="Close"><app-icon name="x" /></button>
          </header>

          <div class="field">
            <label for="e-name">Full name</label>
            <input id="e-name" name="name" class="input" [(ngModel)]="d.name" required minlength="2" />
          </div>

          <div class="field">
            <label for="e-aadhaar">Aadhaar number</label>
            @if (auth.canAdmin()) {
              <input id="e-aadhaar" name="aadhaar" class="input mono" inputmode="numeric" maxlength="14" [ngModel]="d.aadhaar"
                (ngModelChange)="d.aadhaar = format($event)" [placeholder]="loadingAadhaar() ? 'Loading…' : ''" [disabled]="loadingAadhaar()" />
              @if (d.aadhaar && !aadhaarValid()) { <p class="error-text">Enter a valid 12-digit Aadhaar number</p> }
            } @else {
              <input id="e-aadhaar" class="input mono" [value]="'XXXX XXXX ' + r.aadhaarLast4" disabled />
              <p class="hint">Only admins can change the Aadhaar number.</p>
            }
          </div>

          <div class="row2">
            <div class="field">
              <label for="e-age">Age</label>
              <input id="e-age" name="age" type="number" inputmode="numeric" class="input" [(ngModel)]="d.age" required
                [min]="season.settings()?.minAge ?? 0" [max]="season.settings()?.maxAge ?? 120" />
            </div>
            <div class="field">
              <label for="e-gender">Gender</label>
              <select id="e-gender" name="gender" class="input" [(ngModel)]="d.gender" required>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Transgender">Other</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label for="e-phone">Phone number</label>
            <input id="e-phone" name="phone" type="tel" inputmode="numeric" maxlength="10" class="input" [(ngModel)]="d.phone" required pattern="[6-9][0-9]{9}" />
          </div>

          <div class="field">
            <label for="e-address">Village / address</label>
            <textarea id="e-address" name="address" class="input" rows="2" [(ngModel)]="d.address" required></textarea>
          </div>

          @if (error()) { <div class="notice notice-error" role="alert"><app-icon name="warning-circle" /><p>{{ error() }}</p></div> }

          <div class="acts">
            <button type="button" class="btn" (click)="close()">Cancel</button>
            <button type="submit" class="btn btn-primary" [disabled]="saving() || f.invalid || (auth.canAdmin() && !aadhaarValid())">
              {{ saving() ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </form>
      }
    </dialog>
  `,
  styles: `
    dialog { border: 1px solid var(--border); border-radius: calc(var(--radius) + 4px); padding: 0; width: min(440px, calc(100vw - 24px));
      max-height: calc(100dvh - 24px); color: var(--foreground); background: var(--card); box-shadow: var(--shadow-lg); }
    dialog::backdrop { background: hsl(0 0% 0% / 0.25); }
    .sheet { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    header { display: flex; align-items: center; justify-content: space-between; }
    h2 { font-size: 1.05rem; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  `,
})
export class EditMemberComponent {
  protected readonly auth = inject(AuthService);
  protected readonly season = inject(SeasonService);
  private readonly service = inject(RegistrationService);
  private readonly toast = inject(ToastService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly saved = output<void>();
  protected readonly row = signal<Row | null>(null);
  protected readonly saving = signal(false);
  protected readonly loadingAadhaar = signal(false);
  protected readonly error = signal<string | null>(null);
  protected d: Draft = { name: '', age: null, gender: '', phone: '', address: '', aadhaar: '' };
  private originalAadhaar = '';
  protected readonly format = formatAadhaar;

  async open(r: Row): Promise<void> {
    this.row.set(r);
    this.error.set(null);
    this.d = { name: r.name, age: r.age, gender: r.gender as Gender | '', phone: r.phone, address: r.address, aadhaar: '' };
    this.originalAadhaar = '';
    this.dialog().nativeElement.showModal();
    if (this.auth.canAdmin()) {
      this.loadingAadhaar.set(true);
      try {
        this.originalAadhaar = (await this.service.aadhaarOf(r.reg.id, r.ticketNumber)) ?? '';
        this.d.aadhaar = formatAadhaar(this.originalAadhaar);
      } finally {
        this.loadingAadhaar.set(false);
      }
    }
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected aadhaarValid(): boolean {
    return isValidAadhaar(this.d.aadhaar);
  }

  protected async save(r: Row): Promise<void> {
    const s = this.season.settings();
    const age = Number(this.d.age);
    if (s && (age < s.minAge || age > s.maxAge)) return this.error.set(`Age must be ${s.minAge} to ${s.maxAge}.`);
    const newAadhaar = this.d.aadhaar.replace(/\D/g, '');
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.service.updateMember(
        r.reg.id,
        r.ticketNumber,
        { name: this.d.name, age, gender: this.d.gender, phone: this.d.phone, address: this.d.address },
        this.auth.canAdmin() && this.originalAadhaar && newAadhaar !== this.originalAadhaar ? { from: this.originalAadhaar, to: newAadhaar } : undefined,
      );
      this.toast.show(`Ticket ${r.ticketNumber} updated`, 'ok');
      this.saved.emit();
      this.close();
    } catch (e: any) {
      console.error(e);
      this.error.set(
        e instanceof RegistrationError ? e.message : e?.code === 'permission-denied' ? 'You do not have permission to make this change.' : 'Could not save. Please try again.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected backdrop(e: MouseEvent): void {
    if (e.target === this.dialog().nativeElement) this.close();
  }
}
