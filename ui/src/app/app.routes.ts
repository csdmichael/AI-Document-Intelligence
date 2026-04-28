import { Routes } from '@angular/router';
import { BlobFilesPage } from './pages/blob-files/blob-files.page';
import { ParsedDocumentsPage } from './pages/parsed-documents/parsed-documents.page';
import { DocumentDetailPage } from './pages/document-detail/document-detail.page';

export const routes: Routes = [
  { path: '', redirectTo: 'blobs', pathMatch: 'full' },
  { path: 'blobs', component: BlobFilesPage },
  { path: 'parsed', component: ParsedDocumentsPage },
  { path: 'documents/:id', component: DocumentDetailPage },
];
