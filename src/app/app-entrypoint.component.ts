import { Component, OnInit, inject } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { PrimeNG } from 'primeng/config'
import { merge, mergeMap } from 'rxjs'

@Component({
  selector: 'app-root',
  templateUrl: './app-entrypoint.component.html',
  standalone: false
})
export class AppEntrypointComponent implements OnInit {
  private readonly translateService = inject(TranslateService)
  private readonly config = inject(PrimeNG)

  ngOnInit(): void {
    merge(
      this.translateService.onLangChange,
      this.translateService.onTranslationChange,
      this.translateService.onDefaultLangChange
    )
      .pipe(mergeMap(() => this.translateService.get('primeng')))
      .subscribe((res) => this.config.setTranslation(res))
  }
}
