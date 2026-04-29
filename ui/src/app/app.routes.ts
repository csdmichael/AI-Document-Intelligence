import { Routes } from '@angular/router';
import { DashboardPage } from './pages/dashboard/dashboard.page';
import { DocumentDetailPage } from './pages/document-detail/document-detail.page';
import { BlobFilesPage } from './pages/blob-files/blob-files.page';

export const routes: Routes = [
  { path: '', component: DashboardPage },
  { path: 'blob-files', component: BlobFilesPage },
  { path: 'documents/:id', component: DocumentDetailPage },
];
