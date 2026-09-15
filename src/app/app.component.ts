import { Component } from '@angular/core'
import { StandaloneShellModule } from '@onecx/angular-standalone-shell'

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  imports: [StandaloneShellModule]
})
export class AppComponent {}
