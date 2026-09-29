import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { isValidAadhaar } from '../../aadhaar/verhoeff';
import { Registration } from '../../core/models';
import { RegistrationService } from '../../core/registration.service';
import { SeasonService } from '../../core/season.service';
import { downloadTicketPdf } from '../../core/ticket-pdf';
import { SiteFooterComponent } from '../../shared/site-footer';
import { SiteHeaderComponent } from '../../shared/site-header';
import { ToastService } from '../../shared/toast';

/** Find a ticket by Aadhaar or phone. Lookups are exact-match documents, so nobody can browse others' data. */
@Component({
  selector: 'app-ticket',
  imports: [FormsModule, RouterLink, SiteHeaderComponent, SiteFooterComponent],
  templateUrl: './ticket.component.html',
  styleUrl: './ticket.component.css',
})
export class TicketComponent {
  protected readonly season = inject(SeasonService);
  private readonly registrations = inject(RegistrationService);
  private readonly toast = inject(ToastService);

  protected query = '';
  protected readonly searching = signal(false);
  protected readonly results = signal<Registration[] | null>(null);
  protected readonly error = signal<string | null>(null);

  protected async search(): Promise<void> {
    const digits = this.query.replace(/\D/g, '');
    this.error.set(null);
    this.results.set(null);
    if (digits.length === 12) {
      if (!isValidAadhaar(digits)) return this.error.set('This Aadhaar number is not valid. Please check the digits.');
    } else if (!/^[6-9]\d{9}$/.test(digits)) {
      return this.error.set('Enter a 12-digit Aadhaar number or a 10-digit phone number.');
    }

    this.searching.set(true);
    try {
      this.results.set(digits.length === 12 ? await this.registrations.findByAadhaar(digits) : await this.registrations.findByPhone(digits));
    } catch (e) {
      console.error(e);
      this.error.set('Could not search right now. Please check your internet and try again.');
    } finally {
      this.searching.set(false);
    }
  }

  protected async download(reg: Registration): Promise<void> {
    const s = this.season.settings();
    if (!s) return;
    try {
      await downloadTicketPdf(reg, s);
    } catch (e) {
      console.error(e);
      this.toast.show('Could not create the PDF. Please try again.', 'error');
    }
  }
}
