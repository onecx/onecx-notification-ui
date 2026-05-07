import { TestBed } from '@angular/core/testing'
import { AppComponent } from './app.component'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { AngularAcceleratorModule } from '@onecx/angular-accelerator'
import { RouterTestingModule } from '@angular/router/testing'
import { TranslateTestingModule } from 'ngx-translate-testing'
import { ShellCoreModule } from '@onecx/shell-core'
import { provideHttpClient } from '@angular/common/http'

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      imports: [
        RouterTestingModule,
        AngularAcceleratorModule,
        ShellCoreModule,
        TranslateTestingModule.withTranslations('en', require('./../assets/i18n/en.json'))
          .withTranslations('de', require('./../assets/i18n/de.json'))
          .withDefaultLanguage('en')
      ],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents()
  })

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent)
    const app = fixture.componentInstance

    expect(app).toBeTruthy()
  })
})
