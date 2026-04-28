import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonSpinner,
  IonText,
} from '@ionic/angular/standalone';
import { ApiService } from '../../api.service';
import { BlobFile } from '../../models';

@Component({
  selector: 'app-blob-files',
  standalone: true,
  imports: [CommonModule, IonContent, IonSpinner, IonText],
  template: `
    <div style="padding: 1.5rem; max-width: 1200px; margin: 0 auto;">
      <div *ngIf="loading" style="text-align: center; padding: 3rem;">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Loading blob files...</p>
      </div>

      <div *ngIf="error" style="color: #c62828; padding: 1rem; background: #ffebee; border-radius: 8px;">
        Error: {{ error }}
      </div>

      <div *ngIf="!loading && !error" class="card">
        <h2>📁 Blob Storage Files ({{ blobs.length }})</h2>
        <p style="margin-bottom: 1rem; color: #666; font-size: 0.85rem;">
          Tax exemption PDF forms in the <code>tax-forms</code> container before parsing.
        </p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>File Name</th>
              <th>Size</th>
              <th>Last Modified</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let b of blobs; let i = index">
              <td>{{ i + 1 }}</td>
              <td>{{ b.name }}</td>
              <td>{{ (b.size / 1024).toFixed(1) }} KB</td>
              <td>{{ b.lastModified ? (b.lastModified | date:'medium') : '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class BlobFilesPage implements OnInit {
  blobs: BlobFile[] = [];
  loading = true;
  error = '';

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.getBlobs().subscribe({
      next: (data) => {
        this.blobs = data;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load blobs';
        this.loading = false;
      },
    });
  }
}
