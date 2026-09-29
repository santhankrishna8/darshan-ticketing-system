import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SeasonService } from '../core/season.service';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <div class="temple-band" aria-hidden="true"></div>
    <header class="container bar">
      <a routerLink="/" class="brand">
        <span class="brand-te">గోవిందమాల</span>
        <span class="brand-en">Darshan {{ season.season }}</span>
      </a>
      <nav aria-label="Main">
        <a routerLink="/register" routerLinkActive="active" class="nav-link">నమోదు <span class="en">Register</span></a>
        <a routerLink="/ticket" routerLinkActive="active" class="nav-link">టికెట్ <span class="en">Ticket</span></a>
      </nav>
    </header>
  `,
  styles: `
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 64px; }
    .brand { display: flex; align-items: baseline; gap: 10px; text-decoration: none; color: var(--ink); }
    .brand-te { font-family: var(--font-display); font-size: 1.35rem; color: var(--kumkum); }
    .brand-en { font-size: 0.9rem; font-weight: 600; color: var(--ink-soft); }
    nav { display: flex; gap: 4px; }
    .nav-link { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 12px; border-radius: var(--radius);
      text-decoration: none; color: var(--ink); font-weight: 600; }
    .nav-link:hover { background: var(--surface-sunk); }
    .nav-link.active { color: var(--kumkum); background: var(--kumkum-soft); }
    .en { font-weight: 500; color: var(--ink-soft); font-size: 0.9rem; }
    @media (max-width: 480px) { .en { display: none; } .brand-en { display: none; } }
  `,
})
export class SiteHeaderComponent {
  protected readonly season = inject(SeasonService);
}
