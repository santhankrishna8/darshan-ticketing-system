import { Component, computed, inject, input, signal } from '@angular/core';
import { I18nService } from './i18n.service';
import { IconComponent } from './icon';
import { PwaService } from './pwa.service';

/**
 * "Install app". Android and desktop Chrome show their own prompt; on iPhone/iPad this shows
 * the Share > Add to Home Screen steps for the browser in use.
 */
@Component({
  selector: 'app-install-button',
  imports: [IconComponent],
  template: `
    @if (pwa.canInstall()) {
      <button type="button" [class]="'btn ' + variant()" (click)="install()" data-tour="install">
        <app-icon name="device-mobile" />{{ label() }}
      </button>
      @if (showSteps() && pwa.ios; as ios) {
        <div class="steps" role="status">
          @switch (mode()) {
            @case ('open-in-safari') {
              <p>{{ i18n.t('This browser cannot add apps to the Home Screen. Open this page in Safari:', 'ఈ బ్రౌజర్ నుండి యాప్ జోడించలేరు. ఈ పేజీని Safari లో తెరవండి:') }}</p>
              <ol>
                <li>{{ i18n.t('Tap the ••• or Share menu and choose "Open in Safari" (or copy the link below and paste it in Safari).', '••• లేదా షేర్ మెనూలో "Open in Safari" ఎంచుకోండి (లేదా క్రింది లింక్ కాపీ చేసి Safari లో తెరవండి).') }}</li>
                <li>{{ i18n.t('Then tap Install app again.', 'తర్వాత మళ్ళీ Install app నొక్కండి.') }}</li>
              </ol>
              <button type="button" class="btn btn-sm" (click)="copy()">{{ copied() ? i18n.t('Link copied', 'లింక్ కాపీ అయింది') : i18n.t('Copy link', 'లింక్ కాపీ') }}</button>
            }
            @case ('safari') {
              <ol>
                <li>{{ i18n.t('Tap', 'నొక్కండి') }} <app-icon name="export" /> <strong>{{ i18n.t('Share', 'షేర్') }}</strong> {{ ios.ipad ? i18n.t('at the top right.', 'పైన కుడివైపు.') : i18n.t('at the bottom of the screen.', 'స్క్రీన్ కింద.') }}</li>
                <li>{{ i18n.t('Scroll down and tap', 'కిందకు జరిపి నొక్కండి') }} <strong>Add to Home Screen</strong>.</li>
                <li>{{ i18n.t('Tap', 'నొక్కండి') }} <strong>Add</strong>.</li>
              </ol>
            }
            @default {
              <ol>
                <li>
                  {{ i18n.t('Tap', 'నొక్కండి') }} <app-icon name="export" /> <strong>{{ i18n.t('Share', 'షేర్') }}</strong>
                  {{ ios.browser === 'chrome' ? i18n.t('at the right of the address bar.', 'అడ్రస్ బార్ కుడివైపు.') : i18n.t('in the browser menu.', 'బ్రౌజర్ మెనూలో.') }}
                </li>
                <li>{{ i18n.t('Tap', 'నొక్కండి') }} <strong>Add to Home Screen</strong> {{ i18n.t('(scroll down if you do not see it).', '(కనబడకపోతే కిందకు జరపండి).') }}</li>
                <li>{{ i18n.t('Tap', 'నొక్కండి') }} <strong>Add</strong>.</li>
              </ol>
            }
          }
        </div>
      }
    }
  `,
  styles: `
    :host { display: contents; }
    .steps { flex-basis: 100%; display: flex; flex-direction: column; gap: 8px; font-size: 0.92rem; padding: 12px 14px;
      border: 1px solid var(--border); border-radius: var(--radius); background: var(--muted); }
    ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
    app-icon { vertical-align: -3px; }
  `,
})
export class InstallButtonComponent {
  protected readonly pwa = inject(PwaService);
  protected readonly i18n = inject(I18nService);
  readonly label = input('Install app');
  readonly variant = input('');
  protected readonly showSteps = signal(false);
  protected readonly copied = signal(false);

  /** Old iOS (before 16.4) only lets Safari add to the Home Screen; in-app browsers never can. */
  protected readonly mode = computed(() => {
    const ios = this.pwa.ios;
    if (!ios) return 'none';
    if (ios.browser === 'safari') return 'safari';
    if (ios.browser === 'in-app' || ios.browser === 'other' || (ios.version > 0 && ios.version < 16.4)) return 'open-in-safari';
    return 'share-menu';
  });

  protected async install(): Promise<void> {
    if (!(await this.pwa.install())) this.showSteps.set(true);
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.origin + '/');
      this.copied.set(true);
    } catch {
      prompt('Copy this link', location.origin + '/');
    }
  }
}
