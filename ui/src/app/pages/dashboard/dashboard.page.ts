import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonSpinner } from '@ionic/angular/standalone';
import { forkJoin, catchError, of } from 'rxjs';
import { ApiService } from '../../api.service';
import {
  DocumentSummary, ConfidenceStats, BlobFile, RetrainingStatus,
  CATEGORY_COLORS, CATEGORY_LABELS,
} from '../../models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, IonSpinner],
  template: `
    <div style="padding: 1.5rem; max-width: 1400px; margin: 0 auto;">
      <div *ngIf="loading" style="text-align: center; padding: 3rem;">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Loading dashboard...</p>
      </div>

      <div *ngIf="error" style="color: #c62828; padding: 1rem; background: #ffebee; border-radius: 8px; margin-bottom: 1rem;">
        Error: {{ error }}
      </div>

      <ng-container *ngIf="!loading">
        <!-- KPI Stats Bar -->
        <div *ngIf="stats" class="stats-bar">
          <div *ngFor="let key of statKeys" class="stat-card clickable"
               [style.background]="getColor(key)"
               [class.selected]="categoryFilter === capitalize(key)"
               (click)="filterByCategory(capitalize(key))">
            <div class="count">{{ getStatValue(key) }}</div>
            <div class="label">{{ getLabel(key) }}</div>
          </div>
          <div class="stat-card" style="background: #555;"
               [class.selected]="categoryFilter === 'All'"
               (click)="filterByCategory('All')">
            <div class="count">{{ stats.total }}</div>
            <div class="label">Total Parsed</div>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="filter-bar">
          <div class="filter-tabs">
            <button class="filter-tab" [class.active]="reviewFilter === 'all'" (click)="setReviewFilter('all')">All Documents</button>
            <button class="filter-tab reviewed" [class.active]="reviewFilter === 'reviewed'" (click)="setReviewFilter('reviewed')">✓ Reviewed</button>
            <button class="filter-tab not-reviewed" [class.active]="reviewFilter === 'not-reviewed'" (click)="setReviewFilter('not-reviewed')">⬤ Not Reviewed</button>
          </div>

          <!-- Retraining Panel -->
          <div *ngIf="retraining" class="retrain-badge" [class.ready]="retraining.readyForTraining">
            <span>🧠 {{ retraining.reviewedDocuments }}/{{ retraining.minimumRequired }} reviewed</span>
            <span *ngIf="retraining.totalCorrections > 0"> · {{ retraining.totalCorrections }} corrections</span>
            <button *ngIf="retraining.readyForTraining" class="retrain-btn" (click)="exportTraining()">
              Export Training Data
            </button>
            <span *ngIf="!retraining.readyForTraining" style="color: #999; font-size: 0.75rem; margin-left: 0.5rem;">
              (need {{ retraining.minimumRequired - retraining.reviewedDocuments }} more)
            </span>
          </div>
        </div>

        <!-- Blob Files Section -->
        <div class="card" *ngIf="showBlobs">
          <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" (click)="showBlobs = !showBlobs">
            <h2>📁 Blob Storage Files ({{ blobs.length }})</h2>
            <span style="color: #888; font-size: 0.8rem;">▲ Collapse</span>
          </div>
          <p style="margin-bottom: 0.75rem; color: #666; font-size: 0.85rem;">
            Raw tax exemption PDFs in <code>tax-forms</code> container.
          </p>
          <div style="max-height: 300px; overflow-y: auto;">
            <table>
              <thead>
                <tr><th>#</th><th>File Name</th><th>Size</th><th>Last Modified</th><th>Parsed?</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let b of blobs; let i = index">
                  <td>{{ i + 1 }}</td>
                  <td>{{ b.name }}</td>
                  <td>{{ (b.size / 1024).toFixed(1) }} KB</td>
                  <td>{{ b.lastModified ? (b.lastModified | date:'medium') : '-' }}</td>
                  <td>
                    <span *ngIf="isParsed(b.name)" class="badge Green">✓ Parsed</span>
                    <span *ngIf="!isParsed(b.name)" class="badge" style="background: #999;">Pending</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="card collapsed-bar" *ngIf="!showBlobs" (click)="showBlobs = true">
          <h2 style="margin: 0;">📁 Blob Storage Files ({{ blobs.length }}) <span style="color: #888; font-size: 0.8rem; font-weight: normal;">▼ Expand</span></h2>
        </div>

        <!-- Documents Grouped by Confidence Category -->
        <div *ngFor="let group of groupedDocs" class="card" style="border-left: 4px solid {{ getCatColor(group.category) }};">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <h2 style="margin: 0;">
              <span [class]="'badge ' + group.category" style="font-size: 0.85rem; padding: 0.25rem 0.75rem;">
                {{ group.category }}
              </span>
              {{ categoryLabels[group.category] || group.category }}
              <span style="color: #888; font-weight: normal; font-size: 0.9rem;">({{ group.docs.length }} docs)</span>
            </h2>
            <div style="display: flex; gap: 1rem; align-items: center;">
              <div class="kpi-mini">
                <span class="kpi-value">{{ (group.avgConfidence * 100).toFixed(1) }}%</span>
                <span class="kpi-label">Avg Confidence</span>
              </div>
              <div class="kpi-mini">
                <span class="kpi-value">{{ group.totalFields }}</span>
                <span class="kpi-label">Total Fields</span>
              </div>
              <div class="kpi-mini">
                <span class="kpi-value">{{ group.reviewedCount }}/{{ group.docs.length }}</span>
                <span class="kpi-label">Reviewed</span>
              </div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th><th>File Name</th><th>State</th><th>Status</th>
                <th>Confidence</th><th>Sections</th><th>Fields</th><th>Parsed</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let doc of group.docs; let i = index">
                <td>{{ i + 1 }}</td>
                <td><a class="doc-link" [routerLink]="['/documents', doc.id]">{{ doc.fileName }}</a></td>
                <td>{{ doc.stateName }} ({{ doc.state }})</td>
                <td>
                  <span [class]="'status-badge status-' + doc.status">{{ doc.status }}</span>
                </td>
                <td>
                  <span [class]="'badge ' + doc.confidenceCategory">
                    {{ (doc.overallConfidence * 100).toFixed(1) }}%
                  </span>
                </td>
                <td>{{ doc.totalSections }}</td>
                <td>{{ doc.totalFields }}</td>
                <td>{{ doc.parsedAt ? (doc.parsedAt | date:'short') : '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div *ngIf="groupedDocs.length === 0 && !loading" class="card" style="text-align: center; color: #999; padding: 2rem;">
          No documents found for the selected filters.
        </div>
      </ng-container>
    </div>
  `,
})
export class DashboardPage implements OnInit {
  blobs: BlobFile[] = [];
  allDocs: DocumentSummary[] = [];
  stats: ConfidenceStats | null = null;
  retraining: RetrainingStatus | null = null;
  groupedDocs: { category: string; docs: DocumentSummary[]; avgConfidence: number; totalFields: number; reviewedCount: number }[] = [];
  loading = true;
  error = '';
  showBlobs = false;
  categoryFilter = 'All';
  reviewFilter: 'all' | 'reviewed' | 'not-reviewed' = 'all';
  categoryLabels = CATEGORY_LABELS;
  statKeys: ('blue' | 'green' | 'yellow' | 'red')[] = ['blue', 'green', 'yellow', 'red'];

  private parsedFileNames = new Set<string>();

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadData();
  }

  filterByCategory(cat: string): void {
    this.categoryFilter = cat;
    this.applyFilters();
  }

  setReviewFilter(f: 'all' | 'reviewed' | 'not-reviewed'): void {
    this.reviewFilter = f;
    this.applyFilters();
  }

  capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  getColor(key: string): string {
    return CATEGORY_COLORS[this.capitalize(key)] || '#555';
  }

  getCatColor(cat: string): string {
    return CATEGORY_COLORS[cat] || '#ccc';
  }

  getLabel(key: string): string {
    return CATEGORY_LABELS[this.capitalize(key)] || key;
  }

  getStatValue(key: string): number {
    if (!this.stats) return 0;
    return (this.stats as unknown as Record<string, number>)[key] ?? 0;
  }

  isParsed(blobName: string): boolean {
    return this.parsedFileNames.has(blobName);
  }

  exportTraining(): void {
    this.api.exportTrainingData().subscribe({
      next: (data) => {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `training-data-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => alert('Failed to export training data'),
    });
  }

  private loadData(): void {
    this.loading = true;
    forkJoin([
      this.api.getBlobs(),
      this.api.getDocuments(),
      this.api.getConfidenceStats().pipe(catchError(() => of({ blue: 0, green: 0, yellow: 0, red: 0, total: 0 } as ConfidenceStats))),
      this.api.getRetrainingStats().pipe(catchError(() => of(null))),
    ]).subscribe({
      next: ([blobs, docs, stats, retraining]) => {
        this.blobs = blobs;
        this.allDocs = docs;
        this.stats = stats;
        this.retraining = retraining;
        this.parsedFileNames = new Set(docs.map(d => d.fileName));
        this.applyFilters();
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load data';
        this.loading = false;
      },
    });
  }

  private applyFilters(): void {
    let filtered = [...this.allDocs];

    if (this.categoryFilter !== 'All') {
      filtered = filtered.filter(d => d.confidenceCategory === this.categoryFilter);
    }
    if (this.reviewFilter === 'reviewed') {
      filtered = filtered.filter(d => d.status === 'reviewed' || d.status === 'approved');
    } else if (this.reviewFilter === 'not-reviewed') {
      filtered = filtered.filter(d => d.status !== 'reviewed' && d.status !== 'approved');
    }

    const catOrder = ['Red', 'Yellow', 'Green', 'Blue'];
    const groups = new Map<string, DocumentSummary[]>();
    for (const cat of catOrder) {
      const catDocs = filtered.filter(d => d.confidenceCategory === cat);
      if (catDocs.length > 0) {
        groups.set(cat, catDocs);
      }
    }

    this.groupedDocs = Array.from(groups.entries()).map(([category, docs]) => ({
      category,
      docs,
      avgConfidence: docs.reduce((sum, d) => sum + d.overallConfidence, 0) / docs.length,
      totalFields: docs.reduce((sum, d) => sum + d.totalFields, 0),
      reviewedCount: docs.filter(d => d.status === 'reviewed' || d.status === 'approved').length,
    }));
  }
}
