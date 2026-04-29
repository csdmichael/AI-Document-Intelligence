import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonSpinner } from '@ionic/angular/standalone';
import { forkJoin, catchError, of } from 'rxjs';
import { ApiService } from '../../api.service';
import {
  DocumentSummary, ConfidenceStats, RetrainingStatus,
  CATEGORY_COLORS, CATEGORY_LABELS,
} from '../../models';

const PAGE_SIZE = 10;

interface DocGroup {
  category: string;
  docs: DocumentSummary[];
  avgConfidence: number;
  totalFields: number;
  reviewedCount: number;
  page: number;
  totalPages: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, IonSpinner],
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

          <!-- State Filter -->
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <label style="font-size: 0.8rem; color: #666;">State:</label>
            <select class="state-select" [value]="stateFilter" (change)="setStateFilter($any($event.target).value)">
              <option value="All">All States</option>
              <option *ngFor="let s of states" [value]="s">{{ s }}</option>
            </select>
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

        <!-- Documents Grouped by Confidence Category -->
        <div *ngFor="let group of groupedDocs" class="card" [style.border-left]="'4px solid ' + getCatColor(group.category)">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
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
              <tr *ngFor="let doc of getPageDocs(group); let i = index"
                  style="cursor: pointer;"
                  (click)="openDocument(doc.id)">
                <td>{{ (group.page - 1) * pageSize + i + 1 }}</td>
                <td><span class="doc-link">{{ doc.fileName }}</span></td>
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

          <!-- Pagination -->
          <div *ngIf="group.totalPages > 1" class="pagination">
            <button class="page-btn" [disabled]="group.page <= 1" (click)="setPage(group, group.page - 1)">‹ Prev</button>
            <ng-container *ngFor="let p of getPageNumbers(group)">
              <button class="page-btn" [class.active]="p === group.page" (click)="setPage(group, p)">{{ p }}</button>
            </ng-container>
            <button class="page-btn" [disabled]="group.page >= group.totalPages" (click)="setPage(group, group.page + 1)">Next ›</button>
            <span style="color: #888; font-size: 0.75rem; margin-left: 0.5rem;">
              {{ (group.page - 1) * pageSize + 1 }}–{{ min(group.page * pageSize, group.docs.length) }} of {{ group.docs.length }}
            </span>
          </div>
        </div>

        <div *ngIf="groupedDocs.length === 0 && !loading" class="card" style="text-align: center; color: #999; padding: 2rem;">
          No documents found for the selected filters.
        </div>
      </ng-container>
    </div>
  `,
})
export class DashboardPage implements OnInit {
  allDocs: DocumentSummary[] = [];
  stats: ConfidenceStats | null = null;
  retraining: RetrainingStatus | null = null;
  groupedDocs: DocGroup[] = [];
  loading = true;
  error = '';
  categoryFilter = 'All';
  reviewFilter: 'all' | 'reviewed' | 'not-reviewed' = 'all';
  stateFilter = 'All';
  states: string[] = [];
  categoryLabels = CATEGORY_LABELS;
  statKeys: ('blue' | 'green' | 'yellow' | 'red')[] = ['blue', 'green', 'yellow', 'red'];
  pageSize = PAGE_SIZE;

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit(): void {
    this.loadData();
  }

  openDocument(id: string): void {
    this.router.navigate(['/documents', id]);
  }

  filterByCategory(cat: string): void {
    this.categoryFilter = cat;
    this.applyFilters();
  }

  setReviewFilter(f: 'all' | 'reviewed' | 'not-reviewed'): void {
    this.reviewFilter = f;
    this.applyFilters();
  }

  setStateFilter(state: string): void {
    this.stateFilter = state;
    this.applyFilters();
  }

  getPageDocs(group: DocGroup): DocumentSummary[] {
    const start = (group.page - 1) * PAGE_SIZE;
    return group.docs.slice(start, start + PAGE_SIZE);
  }

  getPageNumbers(group: DocGroup): number[] {
    const pages: number[] = [];
    const total = group.totalPages;
    const current = group.page;
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  setPage(group: DocGroup, page: number): void {
    if (page >= 1 && page <= group.totalPages) {
      group.page = page;
    }
  }

  min(a: number, b: number): number {
    return Math.min(a, b);
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
      this.api.getDocuments(),
      this.api.getConfidenceStats().pipe(catchError(() => of({ blue: 0, green: 0, yellow: 0, red: 0, total: 0 } as ConfidenceStats))),
      this.api.getRetrainingStats().pipe(catchError(() => of(null))),
    ]).subscribe({
      next: ([docs, stats, retraining]) => {
        this.allDocs = docs;
        this.stats = stats;
        this.retraining = retraining;
        this.states = [...new Set(docs.map(d => d.state))].sort();
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
    if (this.stateFilter !== 'All') {
      filtered = filtered.filter(d => d.state === this.stateFilter);
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
      page: 1,
      totalPages: Math.ceil(docs.length / PAGE_SIZE),
    }));
  }
}
