import { Component, inject, input, signal } from '@angular/core';
import { PwaService } from './pwa.service';
import { IconComponent } from './icon';

/** "Install app" with an iPhone fallback explaining Share > Add to Home Screen. */
@Component({
  selector: 'app-install-button',
  imports: [IconComponent],
  template: `
    @if (pwa.canInstall()) {
      <button type="button" [class]="'btn ' + variant()" (click)="install()" data-tour="install">
        <app-icon name="device-mobile" />{{ label() }}
      </button>
      @if (iosHint()) {
        <p class="ios-hint" role="status">
          Tap <app-icon name="export" /> <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
          <span class="te">షేర్ నొక్కి "Add to Home Screen" ఎంచుకోండి.</span>
        </p>
      }
    }
  `,
  styles: `
    :host { display: contents; }
    .ios-hint { flex-basis: 100%; font-size: 0.92rem; padding: 10px 12px; border-radius: var(--radius); background: var(--highlight); }
    .ios-hint .te { display: block; color: var(--muted-foreground); }
  `,
})
export class InstallButtonComponent {
  protected readonly pwa = inject(PwaService);
  readonly label = input('Install app · యాప్');
  readonly variant = input('');
  protected readonly iosHint = signal(false);

  protected async install(): Promise<void> {
    if (!(await this.pwa.install())) this.iosHint.set(true);
  }
}
