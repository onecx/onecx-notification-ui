# Coding Standards — onecx-notification-ui

This project is a notification micro-frontend built as a Module Federation remote. The architecture and conventions below reflect the real structure of this repository and should be treated as the source of truth.

---

## Architecture

```
src/
  app/
    app.module.ts                         # Root app module for shell bootstrap
    app-routing.module.ts                 # App routing configuration
    app.component.ts                     # Root application component
    app.component.spec.ts                # Root component tests
    app-entrypoint.component.ts          # Remote entry/bootstrap component
    app-entrypoint.component.html        # Host integration wrapper
    onecx-notification.remote.module.ts  # Remote bootstrap for the notification web component
    app.reducers.ts                     # NgRx reducers
    app.state.ts                        # Shared app state
    remotes/
      notification-connector/
        notification-connector.component.ts
        notification-connector.component.spec.ts
        notification-connector.component.main.ts
        notification-connector.component.bootstrap.ts
    shared/
      generated/                        # Auto-generated API layer; do not edit manually
      selectors/
        onecx.selectors.ts
        router.selectors.ts
      utils/
        apiConfigProvider.utils.ts
        logger.utils.ts
        sockjs.utils.ts
      shared.module.ts
  assets/
    api/
    i18n/
    images/
  environments/
    environment.ts
    environment.prod.ts
```

### Generated API layer

`src/app/shared/generated/` is generated from the OpenAPI contract and must not be edited manually. Run `npm run apigen` after changing the API specification.

---

## Code style

The project uses Angular, Nx, and Jest, with Prettier and ESLint configured through the workspace.

- Component selectors use the `app-` prefix and kebab-case names, for example `app-notification-connector`.
- Directive selectors use the `app` prefix and camelCase naming.
- Prefer typed code over `any`.
- Keep imports ordered by Angular, RxJS, third-party, OneCX, and local imports.
- Use English for comments and documentation.
- Every interactive element should have a stable `id`, `ariaLabel`, and tooltip when applicable.

---

## Coding patterns

### Interactive HTML Elements

- Every interactive element (`a`, `p-button`, `input`, etc.) **MUST** have an `id`, `[ariaLabel]`, and `[pTooltip]`.

### Class member grouping

Use short inline section comments to group class members consistently:

```typescript
// signals
public readonly visible = signal(false)
// data
private readonly dataSubject$ = new BehaviorSubject<Theme[]>([])
public data$: Observable<Theme[]> = this.dataSubject$.asObservable()
// dialog
public loading = false
public exceptionKey: string | undefined = undefined
// image
public imageBasePath = this.imageApi.configuration.basePath
```

### Type aliases for UI state

Define string literal union types at the top of the file for component-level states and modes:

```typescript
export type ChangeMode = 'VIEW' | 'EDIT'
export type LoadingState = 'initial' | 'ready' | 'loading' | 'timeout'
```

### Error handling with `exceptionKey`

Use a single `exceptionKey` property (not a signal) to hold the i18n key for errors displayed via `<p-message>`. Map HTTP status codes through `Utils.mapping_error_status()`:

```typescript
public exceptionKey: string | undefined = undefined

catchError((err) => {
  this.exceptionKey = 'EXCEPTIONS.HTTP_STATUS_' + Utils.mapping_error_status(err.status) + '.THEME'
  console.error('methodName', err)
  return of(undefined)
})
```

Always log the raw error with `console.error('calledMethodName', err)`.

### Data loading with Subject trigger

For reloadable lists, use a `BehaviorSubject` for the data stream and a `Subject` as the reload trigger:

```typescript
private readonly dataSubject$ = new BehaviorSubject<RowListGridData[]>([])
public data$: Observable<RowListGridData[]> = this.dataSubject$.asObservable()
private readonly loadTrigger$ = new Subject<void>()

constructor() {
  this.loadTrigger$
    .pipe(
      switchMap(() => {
        this.loading = true
        return this.api.search({}).pipe(
          map((data) => data.stream ?? []),
          catchError((err) => { this.exceptionKey = ...; return of([]) }),
          finalize(() => (this.loading = false))
        )
      }),
      takeUntilDestroyed(this.destroyRef)
    )
    .subscribe((data) => this.dataSubject$.next(data))
}

public loadData(): void {
  this.loadTrigger$.next()
}
```

### Utils — object pattern for Jasmine spy compatibility

All shared utility functions live in the `Utils` const object in `src/app/shared/utils.ts` — not as standalone exports. This allows `spyOn(Utils, 'methodName')` in Jasmine:

```typescript
// ✅ correct — spyable
export const Utils = {
  sortByDisplayName(a: { displayName?: string }, b: { displayName?: string }): number { ... }
}

// ❌ wrong — standalone functions cannot be spied on in Jasmine
export function sortByDisplayName(...): number { ... }
```

### Locale-aware date formatting

Read the user's language from `UserService.lang$.getValue()` in `ngOnInit()` and derive `dateFormat`:

```typescript
this.dateFormat = this.user.lang$.getValue() === 'de' ? 'dd.MM.yyyy HH:mm:ss' : 'M/d/yy, hh:mm:ss a'
```

### Slot mechanism (cross-micro-frontend communication)

Use `injectInitializedSlotService()` instead of injecting `SlotService` directly:

```typescript
private readonly slotService = injectInitializedSlotService()
public readonly isComponentDefined = toSignal(
  this.slotService.isSomeComponentDefinedForSlot('slot-name'), { initialValue: false }
)
```

When receiving data back from a slot, use `EventEmitter` (not `Subject`) because `ocx-slot [outputs]` calls `.emit()` on the provided instance:

```typescript
// EventEmitter required here — ocx-slot [outputs] is typed as { [key: string]: EventEmitter<any> }
public readonly slotEmitter = new EventEmitter<Workspace[]>()
```

Subscribe in `ngOnInit()` with `takeUntilDestroyed(this.destroyRef)`. Requires: `destroyRef = inject(DestroyRef)` within the inject() section.

### Remote components

Components in `src/app/remotes/` implement `ocxRemoteComponent` and `ocxRemoteWebcomponent`. They **must** use `@Input()` (not `input()`) for the web-component interface contract:

```typescript
@Input() set ocxRemoteComponentConfig(config: RemoteComponentConfig) {
  this.ocxInitRemoteComponent(config)
}
// output to the host via @Input EventEmitter — required by the remote component protocol
@Input() imageLoadingFailed = new EventEmitter<boolean>()
```

All other inputs on the same remote component may use `input()` signals.

---

## Testing standards

This repository uses Jest. Do not replace it with Karma/Jasmine and do not add Karma/Jasmine dependencies.

### Standard TestBed setup (for example XComponent)

- `X` is used in the following as a placeholder for a feature name

```typescript
describe('XComponent', () => {
  let component: XComponent
  let fixture: ComponentFixture<XComponent>

  const apiServiceSpy = {
    loadData: jest.fn(),
    saveData: jest.fn()
  }

  function initTestComponent(): void {
    fixture = TestBed.createComponent(XComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        XComponent,
        TranslateTestingModule.withTranslations({
          de: require('src/assets/i18n/de.json'),
          en: require('src/assets/i18n/en.json')
        }).withDefaultLanguage('en')
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        providePermissionService(),
        provideNoopAnimations(),
        provideRouter([{ path: '', component: XComponent }])
      ]
    })
      .overrideComponent(XComponent, {
        add: {
          providers: [
            { provide: XAPIService, useValue: apiSpy },
            { provide: PortalMessageService, useValue: msgServiceSpy }
          ]
        }
      })
      .compileComponents()
  })

  beforeEach(() => {
    // Reset all spies and set sensible defaults BEFORE creating the component
    apiSpy.getX.calls.reset()
    msgServiceSpy.success.calls.reset()
    apiSpy.getX.and.returnValue(of({ resource: {} }) as XResponse)

    initTestComponent()
  })
})
```

**Rules:**

- Inject API services via `overrideComponent(..., { add: { providers: [...] } })`, not in root `providers`.
- Type spy objects: `jasmine.createSpyObj<ServiceType>()`.
- Reset **all** spy call counters and re-set default return values in `beforeEach()` **before** `initTestComponent()`.
- Use `TranslateTestingModule.withTranslations({ de: require(...), en: require(...) })` — never stub `TranslatePipe` inline.
- Always add `provideNoopAnimations()` and `providePermissionService()`.
- Keep `initTestComponent()` as a local helper so tests can re-create the component after changing spy defaults (e.g. to cover constructor branches).

### Testing signals and effects

- Set `model`/`input` signal values with `fixture.componentRef.setInput('name', value)` followed by `fixture.detectChanges()`
- To test constructor logic that depends on a spy return value, change the spy **then** call `initTestComponent()`.
- Avoid `fakeAsync` + `tick()` entirely. It depends on legacy Zone.js and is incompatible with zoneless Angular architectures.
- For standard asynchronous tasks (Promises, Observables, Rendering), always use native `async/await` combined with `await fixture.whenStable()`.
- For time-delayed logic (e.g., `setTimeout` or debounce timers), use the native fake timers of your test runner (`jasmine.clock().tick()` or `jest.advanceTimersByTime()`).
