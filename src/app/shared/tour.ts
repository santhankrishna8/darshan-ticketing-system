import { Component, ElementRef, Injectable, computed, effect, inject, signal, viewChild } from '@angular/core';

export interface TourStep {
  /** CSS selector of the element to highlight; omitted for a centred intro card. */
  target?: string;
  title: string;
  titleTe: string;
  body: string;
  bodyTe: string;
}

interface Tour {
  id: string;
  steps: TourStep[];
}

const SEEN = 'tour.seen.';

function seen(id: string): boolean {
  try {
    return localStorage.getItem(SEEN + id) === '1';
  } catch {
    return true; // storage blocked: never nag
  }
}

/**
 * A short walkthrough per page. Pages register their tour; it plays once on the first
 * visit, and the "Help" button in the header replays it.
 */
@Injectable({ providedIn: 'root' })
export class TourService {
  readonly available = signal<Tour | null>(null);
  readonly active = signal<Tour | null>(null);
  readonly index = signal(0);

  readonly step = computed(() => {
    const t = this.active();
    if (!t) return null;
    return t.steps[this.index()] ?? null;
  });

  /** Make a tour the page's current one, and play it if this device has not seen it. */
  offer(id: string, steps: TourStep[], autoplay = true): void {
    const tour = { id, steps };
    this.available.set(tour);
    if (autoplay && !seen(id)) setTimeout(() => this.available() === tour && !this.active() && this.play(), 600);
  }

  withdraw(id: string): void {
    if (this.available()?.id === id) this.available.set(null);
    if (this.active()?.id === id) this.active.set(null);
  }

  play(): void {
    const t = this.available();
    if (!t) return;
    const steps = t.steps.filter(s => !s.target || document.querySelector(s.target));
    if (!steps.length) return;
    this.index.set(0);
    this.active.set({ id: t.id, steps });
  }

  next(): void {
    const t = this.active();
    if (!t) return;
    if (this.index() < t.steps.length - 1) this.index.update(i => i + 1);
    else this.finish();
  }

  back(): void {
    this.index.update(i => Math.max(0, i - 1));
  }

  finish(): void {
    const t = this.active();
    if (t) {
      try {
        localStorage.setItem(SEEN + t.id, '1');
      } catch {
        /* ignore */
      }
    }
    this.active.set(null);
  }
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

@Component({
  selector: 'app-tour',
  host: { '(window:resize)': 'measure()', '(window:scroll)': 'measure()', '(document:keydown)': 'key($event)' },
  template: `
    @if (tour.step(); as s) {
      <div class="veil" [class.center]="!spot()" (click)="tour.finish()" aria-hidden="true"></div>
      @if (spot(); as b) {
        <div class="spot" [style.top.px]="b.top - 8" [style.left.px]="b.left - 8" [style.width.px]="b.width + 16" [style.height.px]="b.height + 16" aria-hidden="true"></div>
      }
      <section #card class="card" role="dialog" aria-modal="true" [attr.aria-label]="s.title" tabindex="-1"
        [class.below]="place() === 'below'" [class.above]="place() === 'above'" [class.middle]="place() === 'middle'"
        [style.top.px]="cardTop()" [style.left.px]="cardLeft()">
        <p class="count">{{ tour.index() + 1 }} / {{ tour.active()!.steps.length }}</p>
        <h2>{{ s.titleTe }} <span>{{ s.title }}</span></h2>
        <p>{{ s.body }}</p>
        <p class="te">{{ s.bodyTe }}</p>
        <div class="acts">
          <button type="button" class="btn btn-quiet btn-sm" (click)="tour.finish()">Skip</button>
          <span class="grow"></span>
          @if (tour.index() > 0) {
            <button type="button" class="btn btn-sm" (click)="tour.back()"><i class="ph ph-arrow-left" aria-hidden="true"></i>Back</button>
          }
          <button type="button" class="btn btn-primary btn-sm" (click)="tour.next()">
            {{ tour.index() === tour.active()!.steps.length - 1 ? 'Done · సరే' : 'Next · తర్వాత' }}
          </button>
        </div>
      </section>
    }
  `,
  styles: `
    .veil { position: fixed; inset: 0; z-index: 60; }
    .veil.center { background: rgb(27 15 10 / 0.55); }
    .spot { position: absolute; z-index: 61; border-radius: 14px; pointer-events: none;
      box-shadow: 0 0 0 3px var(--turmeric), 0 0 0 9999px rgb(27 15 10 / 0.55); transition: top .25s ease, left .25s ease, width .25s ease, height .25s ease; }
    .card { position: fixed; z-index: 62; width: min(360px, calc(100vw - 32px)); padding: 18px 18px 14px;
      background: var(--surface); color: var(--ink); border-radius: var(--radius-lg); border-top: 4px solid var(--turmeric);
      box-shadow: 0 20px 50px -12px rgb(0 0 0 / .45); outline: none; }
    .card.middle { transform: translate(-50%, -50%); }
    .count { font-size: .8rem; font-weight: 700; color: var(--ink-soft); }
    h2 { font-size: 1.35rem; color: var(--kumkum); margin: 2px 0 8px; }
    h2 span { display: block; font-family: var(--font-text); font-size: .95rem; font-weight: 700; color: var(--ink); }
    .te { color: var(--ink-soft); margin-top: 4px; }
    .acts { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
    .grow { flex: 1; }
  `,
})
export class TourComponent {
  protected readonly tour = inject(TourService);
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');

  protected readonly spot = signal<Box | null>(null);
  protected readonly place = signal<'below' | 'above' | 'middle'>('middle');
  protected readonly cardTop = signal(0);
  protected readonly cardLeft = signal(0);

  constructor() {
    effect(() => {
      const s = this.tour.step();
      if (!s) return;
      const el = s.target ? document.querySelector<HTMLElement>(s.target) : null;
      el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      this.measure();
      setTimeout(() => this.measure(), 380); // after smooth scrolling settles
      setTimeout(() => this.card()?.nativeElement.focus({ preventScroll: true }));
    });
  }

  protected measure(): void {
    const s = this.tour.step();
    if (!s) return;
    const el = s.target ? document.querySelector<HTMLElement>(s.target) : null;
    const vw = innerWidth;
    const vh = innerHeight;
    const cardW = Math.min(360, vw - 32);
    if (!el) {
      this.spot.set(null);
      this.place.set('middle');
      this.cardTop.set(vh / 2);
      this.cardLeft.set(vw / 2);
      return;
    }
    const r = el.getBoundingClientRect();
    this.spot.set({ top: r.top + scrollY, left: r.left + scrollX, width: r.width, height: r.height });
    const cardH = this.card()?.nativeElement.offsetHeight ?? 220;
    const below = r.bottom + 16 + cardH <= vh || r.top < vh / 2;
    this.place.set(below ? 'below' : 'above');
    this.cardTop.set(Math.max(12, Math.min(vh - cardH - 12, below ? r.bottom + 16 : r.top - 16 - cardH)));
    this.cardLeft.set(Math.max(16, Math.min(vw - cardW - 16, r.left + r.width / 2 - cardW / 2)));
  }

  protected key(e: KeyboardEvent): void {
    if (!this.tour.active()) return;
    if (e.key === 'Escape') this.tour.finish();
    else if (e.key === 'ArrowRight') this.tour.next();
    else if (e.key === 'ArrowLeft') this.tour.back();
  }
}

/** Header button that replays the current page's tour. */
@Component({
  selector: 'app-tour-button',
  template: `
    @if (tour.available()) {
      <button type="button" class="help" data-tour="help" (click)="tour.play()" aria-label="Show me around · సహాయం">
        <i class="ph ph-question" aria-hidden="true"></i><span>Help</span>
      </button>
    }
  `,
  styles: `
    .help { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; min-width: 44px; padding: 0 12px; border: 0; border-radius: var(--radius);
      background: transparent; color: var(--ink); font: 600 .95rem var(--font-text); cursor: pointer; }
    .help:hover { background: var(--surface-sunk); }
    .help i { font-size: 1.3rem; color: var(--kumkum); }
    @media (max-width: 480px) { span { display: none; } }
  `,
})
export class TourButtonComponent {
  protected readonly tour = inject(TourService);
}
