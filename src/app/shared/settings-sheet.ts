import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from './i18n.service';
import { IconComponent } from './icon';
import { InstallButtonComponent } from './install-button';
import { TourService } from './tour';

/** Header gear: language, tour, organizer sign-in and install in one small panel. */
@Component({
  selector: 'app-settings-sheet',
  imports: [IconComponent, InstallButtonComponent, RouterLink],
  template: `
    <button type="button" class="trigger" (click)="open()" [attr.aria-label]="i18n.t('Settings', 'సెట్టింగ్స్')" data-tour="settings">
      <app-icon name="gear" />
    </button>
    <dialog #dialog (click)="backdrop($event)" (close)="0">
      <div class="sheet">
        <header>
          <h2>{{ i18n.t('Settings', 'సెట్టింగ్స్') }}</h2>
          <button type="button" class="btn btn-ghost btn-sm" (click)="close()" [attr.aria-label]="i18n.t('Close', 'మూసివేయి')"><app-icon name="x" /></button>
        </header>

        <fieldset>
          <legend>{{ i18n.t('Language', 'భాష') }}</legend>
          <div class="seg" role="radiogroup">
            <button type="button" role="radio" [attr.aria-checked]="i18n.lang() === 'en'" [class.on]="i18n.lang() === 'en'" (click)="i18n.set('en')">English</button>
            <button type="button" role="radio" [attr.aria-checked]="i18n.lang() === 'te'" [class.on]="i18n.lang() === 'te'" (click)="i18n.set('te')">తెలుగు</button>
          </div>
        </fieldset>

        <div class="list">
          @if (tour.available()) {
            <button type="button" class="row" (click)="showTour()"><app-icon name="question" />{{ i18n.t('Show me around', 'ఎలా వాడాలి') }}<app-icon name="caret-right" class="end" /></button>
          }
          <a class="row" routerLink="/seva" (click)="close()"><app-icon name="sign-in" />{{ i18n.t('Organizer sign in', 'నిర్వాహకుల లాగిన్') }}<app-icon name="caret-right" class="end" /></a>
        </div>

        <div class="install"><app-install-button variant="btn-block" [label]="i18n.t('Install app', 'యాప్ ఇన్‌స్టాల్ చేయండి')" /></div>
      </div>
    </dialog>
  `,
  styles: `
    .trigger { display: inline-grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: var(--radius); background: transparent; color: inherit; cursor: pointer; }
    .trigger:hover { background: var(--accent); }
    dialog { border: 1px solid var(--border); border-radius: calc(var(--radius) + 4px); padding: 0; width: min(360px, calc(100vw - 32px)); color: var(--foreground); background: var(--card); box-shadow: var(--shadow-lg); }
    dialog::backdrop { background: hsl(0 0% 0% / 0.25); }
    .sheet { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
    header { display: flex; align-items: center; justify-content: space-between; }
    h2 { font-size: 1rem; font-weight: 500; }
    fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    legend { font-size: 0.85rem; color: var(--muted-foreground); padding: 0; margin-bottom: 8px; }
    .seg { display: grid; grid-template-columns: 1fr 1fr; padding: 3px; gap: 3px; border-radius: var(--radius); background: var(--muted); }
    .seg button { min-height: 38px; border: 0; border-radius: calc(var(--radius) - 2px); background: transparent; color: var(--muted-foreground); font: 400 0.95rem var(--font-sans); cursor: pointer; }
    .seg button.on { background: var(--card); color: var(--foreground); box-shadow: var(--shadow); }
    .list { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
    .row { display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 0 12px; border: 0; background: var(--card); color: var(--foreground); font: 400 0.95rem var(--font-sans); text-decoration: none; cursor: pointer; text-align: left; }
    .row + .row { border-top: 1px solid var(--border); }
    .row:hover { background: var(--muted); }
    .end { margin-left: auto; color: var(--muted-foreground); }
    .install:empty { display: none; }
  `,
})
export class SettingsSheetComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly tour = inject(TourService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected showTour(): void {
    this.close();
    this.tour.play();
  }

  /** Clicking outside the panel closes it. */
  protected backdrop(e: MouseEvent): void {
    if (e.target === this.dialog().nativeElement) this.close();
  }
}
