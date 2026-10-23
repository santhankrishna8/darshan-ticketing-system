import { Component, inject } from '@angular/core';
import { I18nService } from './i18n.service';

/** Disclaimer shown wherever an Aadhaar number is asked for. */
@Component({
  selector: 'app-aadhaar-notice',
  template: `
    <p class="hint">
      {{ i18n.t(
        'Aadhaar details are collected only to identify devotees and prevent duplicate tickets. Only the last 4 digits are shown on screen. Not to be used for any other purpose; misuse is an offence under law.',
        'ఆధార్ వివరాలు భక్తులను గుర్తించడానికి, ఒకే వ్యక్తికి రెండు టికెట్లు రాకుండా చూడటానికి మాత్రమే తీసుకుంటాము. తెరపై చివరి 4 అంకెలు మాత్రమే కనిపిస్తాయి. ఇతర ఏ అవసరానికీ ఉపయోగించకూడదు; దుర్వినియోగం చట్టరీత్యా నేరం.'
      ) }}
    </p>
  `,
  styles: `:host { display: block; margin-block: 12px; text-wrap: balance; }`,
})
export class AadhaarNoticeComponent {
  protected readonly i18n = inject(I18nService);
}
