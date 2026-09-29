import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { RegistrationService } from '../../core/registration.service';
import { SeasonService } from '../../core/season.service';
import { downloadTicketPdf } from '../../core/ticket-pdf';
import { ToastService } from '../../shared/toast';
import { downloadExcel, stamp } from '../excel';
import { Row, StaffDataService } from '../staff-data.service';

@Component({
  selector: 'app-registrations',
  imports: [FormsModule, RouterLink],
  templateUrl: './registrations.component.html',
  styleUrl: './registrations.component.css',
})
export class RegistrationsComponent {
  protected readonly auth = inject(AuthService);
  protected readonly season = inject(SeasonService);
  protected readonly data = inject(StaffDataService);
  private readonly service = inject(RegistrationService);
  private readonly toast = inject(ToastService);

  protected readonly query = signal('');
  protected readonly coordinator = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('coordinator') ?? '');
  protected readonly payment = signal<'' | 'paid' | 'unpaid'>('');
  protected readonly saving = signal<Set<string>>(new Set());
  protected readonly exporting = signal(false);

  protected readonly coordinators = computed(() => [...new Set(this.data.rows().map(r => r.coordinator || 'Not assigned'))]);

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const coord = this.coordinator();
    const pay = this.payment();
    return this.data.rows().filter(r => {
      if (coord && (r.coordinator || 'Not assigned') !== coord) return false;
      if (pay === 'paid' && !r.paid) return false;
      if (pay === 'unpaid' && r.paid) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q) ||
        (digits.length > 0 && (r.phone.includes(digits) || String(r.ticketNumber) === digits || r.aadhaarLast4 === digits || String(r.reg.submissionNo) === digits))
      );
    });
  });

  protected key(r: Row): string {
    return `${r.reg.id}:${r.ticketNumber}`;
  }

  protected async togglePaid(r: Row): Promise<void> {
    const key = this.key(r);
    this.saving.update(s => new Set(s).add(key));
    try {
      await this.service.setPayment(r.reg.id, r.ticketNumber, r.paid ? 'Not Paid' : 'Paid');
    } catch (e) {
      console.error(e);
      this.toast.show(`Could not update ticket ${r.ticketNumber}. Check your connection.`, 'error');
    } finally {
      this.saving.update(s => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
  }

  protected async ticket(r: Row): Promise<void> {
    const s = this.season.settings();
    if (s) await downloadTicketPdf(r.reg, s);
  }

  protected async remove(r: Row): Promise<void> {
    const names = r.reg.members.map(m => `${m.ticketNumber} ${m.name}`).join('\n');
    if (!confirm(`Delete registration #${r.reg.submissionNo}? This removes all its devotees:\n\n${names}\n\nTicket numbers are not reused.`)) return;
    try {
      await this.service.delete(r.reg);
      this.toast.show(`Registration #${r.reg.submissionNo} deleted`, 'ok');
    } catch (e) {
      console.error(e);
      this.toast.show('Could not delete. Only the main admin can delete registrations.', 'error');
    }
  }

  protected async export(): Promise<void> {
    this.exporting.set(true);
    try {
      const full = this.auth.canAdmin() ? await this.service.aadhaarNumbers() : new Map<string, string>();
      const rows = this.filtered().map(r => ({
        Ticket: r.ticketNumber,
        Registration: r.reg.submissionNo,
        Name: r.name,
        Age: r.age,
        Gender: r.gender,
        Aadhaar: full.get(this.key(r)) ?? `XXXX XXXX ${r.aadhaarLast4}`,
        Phone: r.phone,
        Address: r.address,
        Coordinator: r.coordinator,
        Payment: r.paid ? 'Paid' : 'Not Paid',
        Registered: r.reg.createdAt?.toDate().toLocaleString('en-IN') ?? '',
      }));
      const label = this.coordinator() || 'All';
      await downloadExcel(rows, label, `Darshan ${this.season.season} ${label} ${stamp()}.xlsx`);
    } catch (e) {
      console.error(e);
      this.toast.show('Export failed. Please try again.', 'error');
    } finally {
      this.exporting.set(false);
    }
  }
}
