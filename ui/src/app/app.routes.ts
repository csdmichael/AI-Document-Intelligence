import { Routes } from '@angular/router';
import { DashboardPage } from './pages/dashboard/dashboard.page';
import { DocumentDetailPage } from './pages/document-detail/document-detail.page';

export const routes: Routes = [
  { path: '', component: DashboardPage },
  { path: 'documents/:id', component: DocumentDetailPage },
];
