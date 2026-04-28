import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonSpinner } from '@ionic/angular/standalone';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../api.service';
import { DocumentSummary, ConfidenceStats, CATEGORY_COLORS, CATEGORY_LABELS } from '../../models';

const CATEGORIES = ['All', 'Blue', 'Green', 'Yellow', 'Red'] as const;

@Component({
  selector: 'app-parsed-documents',
  standalone: true,
  imports: [CommonModule, RouterLink, IonSpinner],
  template: `
    <div style="padding: 1.5rem; max-width: 1200px; margin: 0 auto;">
      <div *ngIf="loading" style="text-align: center; padding: 3rem;">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Loading parsed documents...</p>
      </div>

      <div *ngIf="error" style="color: #c62828; padding: 1rem; background: #ffebee; border-radius: 8px;">
        Error: {{ error }}
      </div>

      <ng-container *ngIf="!loading && !error">
        <!-- Stats Bar -->
        <div *ngIf="stats" class="stats-bar">
          <div *ngFor="let key of statKeys" class="stat-card" [style.background]="getColor(key)">
            <div class="count">{{ getStatValue(key) }}</div>
            <div class="label">{{ getLabel(key) }}</div>
          </div>
          <div class="stat-card" style="background: #555;">
            <div class="count">{{ stats.total }}</div>
            <div class="label">Total Parsed</div>
          </div>
        </div>

        <!-- Category Filter Tabs -->
        <div class="filter-tabs">
          <button *ngFor="let cat of categories"
                  class="filter-tab"
                  [class]="'filter-tab ' + cat + (filter === cat ? ' active' : '')"
                  (click)="setFilter(cat)">
            {{ cat === 'All' ? 'All Documents' : (categoryLabels[cat] || cat) }}
          </button>
        </div>

        <!-- Documents Table -->
        <div class="card">
          <h2>📄 Parsed Documents ({{ docs.length }})</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>File Name</th>
                <th>State</th>
                <th>Status</th>
                <th>Confidence</th>
                <th>Sections</th>
                <th>Fields</th>
                <th>Parsed At</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let doc of docs; let i = index">
                <td>{{ i + 1 }}</td>
                <td>
                  <a class="doc-link" [routerLink]="['/documents', doc.id]">{{ doc.fileName }}</a>
                </td>
                <td>{{ doc.stateName }} ({{ doc.state }})</td>
                <td>{{ doc.status }}</td>
                <td>
                  <span [class]="'badge ' + doc.confidenceCategory">
                    {{ doc.confidenceCategory }} {{ (doc.overallConfidence * 100).toFixed(1) }}%
                  </span>
                </td>
                <td>{{ doc.totalSections }}</td>
                <td>{{ doc.totalFields }}</td>
                <td>{{ doc.parsedAt ? (doc.parsedAt | date:'medium') : '-' }}</td>
              </tr>
              <tr *ngIf="docs.length === 0">
                <td colspan="8" style="text-align: center; color: #999;">No documents found for this filter.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>
    </div>
  `,
})
export class ParsedDocumentsPage implements OnInit {
  docs: DocumentSummary[] = [];
  stats: ConfidenceStats | null = null;
  filter = 'All';
  loading = true;
  error = '';
  categories = CATEGORIES;
  categoryColors = CATEGORY_COLORS;
  categoryLabels = CATEGORY_LABELS;
  statKeys: ('blue' | 'green' | 'yellow' | 'red')[] = ['blue', 'green', 'yellow', 'red'];

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadData();
  }

  setFilter(cat: string): void {
    this.filter = cat;
    this.loading = true;
    this.loadData();
  }

  getColor(key: string): string {
    const cap = key.charAt(0).toUpperCase() + key.slice(1);
    return CATEGORY_COLORS[cap] || '#555';
  }

  getLabel(key: string): string {
    const cap = key.charAt(0).toUpperCase() + key.slice(1);
    return CATEGORY_LABELS[cap] || cap;
  }

  getStatValue(key: string): number {
    if (!this.stats) return 0;
    return (this.stats as unknown as Record<string, number>)[key] ?? 0;
  }

  private loadData(): void {
    const params = this.filter !== 'All' ? { category: this.filter } : undefined;
    forkJoin([this.api.getDocuments(params), this.api.getConfidenceStats()]).subscribe({
      next: ([docs, stats]) => {
        this.docs = docs;
        this.stats = stats;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load documents';
        this.loading = false;
      },
    });
  }
}
