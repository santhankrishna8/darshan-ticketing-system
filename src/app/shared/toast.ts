import { Component, Injectable, inject, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'ok' | 'error' | 'info';
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private next = 1;

  show(text: string, kind: Toast['kind'] = 'info', ms = 4000): void {
    const t = { id: this.next++, kind, text };
    this.toasts.update(list => [...list, t]);
    setTimeout(() => this.dismiss(t.id), ms);
  }

  dismiss(id: number): void {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }
}

@Component({
  selector: 'app-toast-host',
  template: `
    <div class="toasts" role="status" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="'toast toast-' + t.kind">
          <i [class]="t.kind === 'error' ? 'ph ph-warning-circle' : 'ph ph-check-circle'" aria-hidden="true"></i>
          <span>{{ t.text }}</span>
          <button type="button" class="close" (click)="toast.dismiss(t.id)" aria-label="Dismiss"><i class="ph ph-x" aria-hidden="true"></i></button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts { position: fixed; inset: auto 0 16px 0; display: grid; justify-items: center; gap: 8px; padding: 0 16px; z-index: 50; pointer-events: none; }
    .toast { pointer-events: auto; display: flex; align-items: center; gap: 10px; max-width: 520px; width: 100%; padding: 12px 12px 12px 16px;
      border-radius: var(--radius); background: var(--ink); color: var(--paper); box-shadow: var(--shadow); font-weight: 500; }
    .toast i { font-size: 1.3rem; }
    .toast-ok i:first-child { color: var(--leaf-soft); }
    .toast-error { background: var(--danger); color: #fff; }
    span { flex: 1; }
    .close { background: none; border: 0; color: inherit; cursor: pointer; min-width: 36px; min-height: 36px; border-radius: 8px; }
  `,
})
export class ToastHostComponent {
  protected readonly toast = inject(ToastService);
}
