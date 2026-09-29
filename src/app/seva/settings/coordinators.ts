import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SeasonService } from '../../core/season.service';
import { IconComponent } from '../../shared/icon';
import { ToastService } from '../../shared/toast';

/**
 * Coordinators as a list: add by name, reorder, remove. Every change saves straight away.
 * Tickets go to coordinators in blocks, in list order.
 */
@Component({
  selector: 'app-coordinators',
  imports: [FormsModule, IconComponent],
  template: `
    <section class="card box" aria-labelledby="coord-title">
      <div class="head">
        <div>
          <h2 id="coord-title">Coordinators</h2>
          <p class="hint">Tickets are handed out in blocks, top to bottom. Changes apply to new registrations.</p>
        </div>
        <label class="per">
          <span>Tickets each</span>
          <input class="input" type="number" min="1" [ngModel]="perCoordinator()" (change)="savePer($any($event.target).value)" />
        </label>
      </div>

      @if (list().length) {
        <ol class="list">
          @for (name of list(); track $index; let i = $index; let last = $last) {
            <li>
              <span class="num mono">{{ i + 1 }}</span>
              <span class="name">{{ name }}</span>
              <span class="range mono">{{ range(i, last) }}</span>
              <span class="acts">
                <button type="button" class="btn btn-ghost btn-sm" (click)="move(i, -1)" [disabled]="i === 0 || busy()" [attr.aria-label]="'Move ' + name + ' up'"><app-icon name="caret-up" /></button>
                <button type="button" class="btn btn-ghost btn-sm" (click)="move(i, 1)" [disabled]="last || busy()" [attr.aria-label]="'Move ' + name + ' down'"><app-icon name="caret-down" /></button>
                <button type="button" class="btn btn-ghost btn-sm danger" (click)="remove(i)" [disabled]="busy()" [attr.aria-label]="'Remove ' + name"><app-icon name="trash" /></button>
              </span>
            </li>
          }
        </ol>
      } @else {
        <p class="empty muted">No coordinators yet. Tickets are registered without a coordinator until you add one.</p>
      }

      <form class="add" (ngSubmit)="add()">
        <input class="input" name="newName" [(ngModel)]="newName" placeholder="Coordinator name" autocomplete="off" aria-label="Coordinator name" />
        <button type="submit" class="btn btn-primary" [disabled]="!newName.trim() || busy()"><app-icon name="plus" />Add</button>
      </form>
    </section>
  `,
  styles: `
    .box { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
    .head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
    h2 { font-size: 1rem; }
    .per { display: flex; flex-direction: column; gap: 6px; font-size: .875rem; color: var(--muted-foreground); }
    .per .input { width: 110px; }
    .list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--radius); }
    li { display: grid; grid-template-columns: 28px 1fr auto auto; align-items: center; gap: 10px; padding: 6px 8px 6px 12px; min-height: 48px; }
    li + li { border-top: 1px solid var(--border); }
    .num { color: var(--muted-foreground); font-size: .85rem; }
    .name { min-width: 0; overflow-wrap: anywhere; }
    .range { color: var(--muted-foreground); font-size: .85rem; white-space: nowrap; }
    .acts { display: flex; }
    .acts .btn { min-height: 36px; padding: 0 8px; }
    .danger { color: var(--destructive); }
    .empty { font-size: .9rem; }
    .add { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
    @media (max-width: 520px) {
      li { grid-template-columns: 24px 1fr auto; }
      .range { grid-column: 2; grid-row: 2; }
      .acts { grid-column: 3; grid-row: 1 / 3; }
    }
  `,
})
export class CoordinatorsComponent {
  private readonly season = inject(SeasonService);
  private readonly toast = inject(ToastService);

  protected readonly list = computed(() => this.season.settings()?.coordinators ?? []);
  protected readonly perCoordinator = computed(() => this.season.settings()?.ticketsPerCoordinator ?? 50);
  protected readonly busy = signal(false);
  protected newName = '';

  /** "1 - 50", or "151 - 600" for the last one, who takes every ticket after the earlier blocks. */
  protected range(i: number, last: boolean): string {
    const per = this.perCoordinator();
    const total = this.season.settings()?.totalTickets ?? 0;
    const from = i * per + 1;
    const to = last ? total : Math.min(total, (i + 1) * per);
    return from > total ? 'no tickets' : `${from} - ${to}`;
  }

  protected add(): Promise<void> {
    const name = this.newName.trim().replace(/\s+/g, ' ');
    if (!name) return Promise.resolve();
    if (this.list().some(n => n.toLowerCase() === name.toLowerCase())) {
      this.toast.show(`${name} is already in the list`, 'error');
      return Promise.resolve();
    }
    this.newName = '';
    return this.saveList([...this.list(), name], `${name} added`);
  }

  protected move(i: number, by: number): Promise<void> {
    const next = [...this.list()];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    return this.saveList(next);
  }

  protected remove(i: number): Promise<void> {
    const name = this.list()[i];
    if (!confirm(`Remove ${name}? Tickets already registered keep ${name} as their coordinator.`)) return Promise.resolve();
    return this.saveList(this.list().filter((_, j) => j !== i), `${name} removed`);
  }

  protected async savePer(value: string): Promise<void> {
    const n = Math.floor(Number(value));
    if (!n || n < 1) return;
    await this.persist({ ticketsPerCoordinator: n }, 'Saved');
  }

  private saveList(coordinators: string[], message?: string): Promise<void> {
    return this.persist({ coordinators }, message);
  }

  private async persist(changes: { coordinators?: string[]; ticketsPerCoordinator?: number }, message?: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.season.saveSettings(changes);
      if (message) this.toast.show(message, 'ok');
    } catch (e) {
      console.error(e);
      this.toast.show('Could not save coordinators.', 'error');
    } finally {
      this.busy.set(false);
    }
  }
}
