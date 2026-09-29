import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Unsubscribe } from 'firebase/firestore';
import { AuthService } from '../../core/auth.service';
import { StaffMember, StaffRole } from '../../core/models';
import { ToastService } from '../../shared/toast';
import { IconComponent } from '../../shared/icon';

/** Main admin: approve or reject access requests, choose roles, allow biometric unlock. */
@Component({
  selector: 'app-people',
  imports: [IconComponent, NgTemplateOutlet],
  templateUrl: './people.component.html',
  styleUrl: './people.component.css',
})
export class PeopleComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly unsub: Unsubscribe;

  protected readonly people = signal<StaffMember[] | undefined>(undefined);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal<string | null>(null);

  protected readonly pending = computed(() => (this.people() ?? []).filter(p => p.status === 'pending'));
  protected readonly approved = computed(() => (this.people() ?? []).filter(p => p.status === 'approved'));
  protected readonly others = computed(() => (this.people() ?? []).filter(p => p.status === 'rejected' || p.status === 'revoked'));

  constructor() {
    this.unsub = this.auth.watchStaff(
      list => this.people.set(list),
      e => this.error.set(e.message),
    );
  }

  ngOnDestroy(): void {
    this.unsub();
  }

  protected async decide(p: StaffMember, changes: Partial<Pick<StaffMember, 'status' | 'role' | 'biometricAllowed'>>, done: string): Promise<void> {
    this.busy.set(p.uid);
    try {
      await this.auth.decide(p.uid, changes);
      this.toast.show(done, 'ok');
    } catch (e) {
      console.error(e);
      this.toast.show('Could not save. Please try again.', 'error');
    } finally {
      this.busy.set(null);
    }
  }

  protected approve(p: StaffMember, role: StaffRole): void {
    this.decide(p, { status: 'approved', role }, `${p.name || p.email} can now use the seva desk`);
  }

  protected setRole(p: StaffMember, role: string): void {
    this.decide(p, { role: role as StaffRole }, `${p.name || p.email} is now ${role === 'admin' ? 'an admin' : 'a volunteer'}`);
  }

  protected revoke(p: StaffMember): void {
    if (confirm(`Remove access for ${p.email}?`)) this.decide(p, { status: 'revoked', biometricAllowed: false }, 'Access removed');
  }
}
