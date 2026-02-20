import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { addInitializeModuleGuard } from '@onecx/angular-integration-interface';

export const routes: Routes = [];

@NgModule({
  imports: [
    RouterModule.forRoot(addInitializeModuleGuard(routes)),
    TranslateModule,
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
