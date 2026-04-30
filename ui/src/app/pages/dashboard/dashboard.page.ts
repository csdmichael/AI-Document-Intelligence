import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonSpinner } from '@ionic/angular/standalone';
import { forkJoin, catchError, of } from 'rxjs';
import { ApiService } from '../../api.service';
import {
  DocumentSummary, ConfidenceStats, RetrainingStatus, CustomModelStatus,
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
  imports: [CommonModule, FormsModule, IonSpinner],
  template: `
    <div class="page-container" style="padding: 1.5rem; max-width: 1400px; margin: 0 auto; padding-bottom: 3rem;">
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

        <!-- Custom Model Status Panel -->
        <div *ngIf="customModel" class="card" style="margin-bottom: 1rem; border-left: 4px solid #7b1fa2;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <div>
              <h3 style="margin: 0 0 0.25rem; color: #7b1fa2; font-size: 0.95rem;">🤖 Custom Extraction Model</h3>
              <div style="font-size: 0.82rem; color: #555;">
                <span *ngIf="customModel.isAvailable" style="color: #2e7d32; font-weight: 600;">
                  ✓ Active — {{ customModel.customModelId }}
                </span>
                <span *ngIf="!customModel.isAvailable && customModel.customModelId" style="color: #e65100;">
                  ⚠ Configured but not found — {{ customModel.customModelId }}
                </span>
                <span *ngIf="!customModel.customModelId" style="color: #999;">
                  Not trained yet — using <strong>{{ customModel.primaryModelId }}</strong>
                </span>
              </div>
              <div style="font-size: 0.78rem; color: #888; margin-top: 0.2rem;">
                Compare model: <code>{{ customModel.comparisonModelId }}</code>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div class="kpi-mini">
                <span class="kpi-value">{{ customModel.currentReviewedDocs }}</span>
                <span class="kpi-label">Reviewed docs</span>
              </div>
              <div class="kpi-mini">
                <span class="kpi-value">{{ customModel.minimumReviewedDocs }}</span>
                <span class="kpi-label">Required to train</span>
              </div>
              <div *ngIf="customModel.readyToTrain" style="font-size: 0.8rem; background: #e8f5e9; color: #2e7d32; padding: 0.3rem 0.75rem; border-radius: 12px; font-weight: 600;">
                Ready to train
              </div>
              <div *ngIf="!customModel.readyToTrain" style="font-size: 0.78rem; color: #999;">
                {{ customModel.minimumReviewedDocs - customModel.currentReviewedDocs }} more reviews needed
              </div>
            </div>
          </div>
          <div *ngIf="customModel.readyToTrain" style="margin-top: 0.6rem; font-size: 0.8rem; color: #555; background: #f3e5f5; padding: 0.5rem 0.75rem; border-radius: 6px;">
            💡 Run <code>python -m scripts.train_custom_model</code> to train, then set
            <code>DOC_INTELLIGENCE_CUSTOM_MODEL_ID</code>.
            Use <code>python -m scripts.parse_documents --model &lt;id&gt; --compare</code> to compare results.
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
            <select class="state-select" [(ngModel)]="stateFilter" (ngModelChange)="applyFilters()">
              <option value="All">All States</option>
              <option *ngFor="let s of states" [ngValue]="s">{{ stateNameMap[s] || s }}</option>
            </select>
          </div>

          <!-- Document Type Filter -->
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <label style="font-size: 0.8rem; color: #666;">Type:</label>
            <select class="state-select" [(ngModel)]="docTypeFilter" (ngModelChange)="applyFilters()">
              <option value="All">All Types</option>
              <option value="pdf">📄 PDF</option>
              <option value="pptx">📊 PPTX</option>
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

        <!-- Bulk Actions Bar -->
        <div *ngIf="selectedIds.size > 0" class="bulk-bar">
          <span>{{ selectedIds.size }} document{{ selectedIds.size > 1 ? 's' : '' }} selected</span>
          <button class="bulk-btn reviewed" (click)="bulkSetStatus('reviewed')" [disabled]="bulkLoading">
            ✓ Mark Reviewed
          </button>
          <button class="bulk-btn approved" (click)="bulkSetStatus('approved')" [disabled]="bulkLoading">
            ✔ Mark Approved
          </button>
          <button class="bulk-btn clear" (click)="clearSelection()">✕ Clear</button>
          <ion-spinner *ngIf="bulkLoading" name="crescent" style="width: 18px; height: 18px;"></ion-spinner>
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
          <!-- Desktop/Tablet: Table view -->
          <div class="desktop-table table-scroll">
            <table>
              <thead>
                <tr>
                  <th style="width: 36px;">
                    <input type="checkbox" [checked]="isGroupAllSelected(group)" [indeterminate]="isGroupIndeterminate(group)" (change)="toggleGroupSelection(group, $event)" title="Select all in group" />
                  </th>
                  <th>#</th><th>File Name</th><th>Type</th><th>State</th><th>Model</th><th>Status</th>
                  <th>Confidence</th><th class="hide-tablet">Sections</th><th class="hide-tablet">Fields</th><th>Parsed</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let doc of getPageDocs(group); let i = index"
                    style="cursor: pointer;"
                    [class.row-selected]="selectedIds.has(doc.id)">
                  <td (click)="$event.stopPropagation()">
                    <input type="checkbox" [checked]="selectedIds.has(doc.id)" (change)="toggleDocSelection(doc.id)" />
                  </td>
                  <td (click)="openDocument(doc.id)">{{ (group.page - 1) * pageSize + i + 1 }}</td>
                  <td (click)="openDocument(doc.id)"><span class="doc-link">{{ doc.fileName }}</span></td>
                  <td (click)="openDocument(doc.id)">
                    <span class="doc-type-badge" [class.pptx]="doc.documentType === 'pptx'" [title]="doc.documentType === 'pptx' ? 'PowerPoint Presentation' : 'PDF Document'">
                      {{ doc.documentType === 'pptx' ? '📊 PPTX' : '📄 PDF' }}
                    </span>
                  </td>
                  <td (click)="openDocument(doc.id)">{{ doc.stateName }} ({{ doc.state }})</td>
                  <td (click)="openDocument(doc.id)">
                    <span class="model-badge" [title]="doc.modelSource || ''">
                      {{ shortModelName(doc.modelSource) }}
                    </span>
                  </td>
                  <td (click)="openDocument(doc.id)">
                    <span [class]="'status-badge status-' + doc.status">{{ doc.status }}</span>
                  </td>
                  <td (click)="openDocument(doc.id)">
                    <span [class]="'badge ' + doc.confidenceCategory">
                      {{ (doc.overallConfidence * 100).toFixed(1) }}%
                    </span>
                  </td>
                  <td class="hide-tablet" (click)="openDocument(doc.id)">{{ doc.totalSections }}</td>
                  <td class="hide-tablet" (click)="openDocument(doc.id)">{{ doc.totalFields }}</td>
                  <td (click)="openDocument(doc.id)">{{ doc.parsedAt ? (doc.parsedAt | date:'short') : '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Mobile: Card view -->
          <div class="mobile-cards">
            <div *ngFor="let doc of getPageDocs(group); let i = index"
                 class="doc-card-mobile"
                 [class.row-selected]="selectedIds.has(doc.id)">
              <div class="doc-card-header">
                <input type="checkbox" [checked]="selectedIds.has(doc.id)" (change)="toggleDocSelection(doc.id)" (click)="$event.stopPropagation()" style="margin-right: 0.5rem;" />
                <span class="doc-card-title" (click)="openDocument(doc.id)" style="cursor: pointer;">{{ doc.fileName }}</span>
                <span [class]="'badge ' + doc.confidenceCategory">
                  {{ (doc.overallConfidence * 100).toFixed(1) }}%
                </span>
              </div>
              <div class="doc-card-meta">
                <span class="meta-item">
                  <span class="doc-type-badge" [class.pptx]="doc.documentType === 'pptx'">
                    {{ doc.documentType === 'pptx' ? '📊 PPTX' : '📄 PDF' }}
                  </span>
                </span>
                <span class="meta-item">{{ doc.stateName }} ({{ doc.state }})</span>
                <span class="meta-item">
                  <span [class]="'status-badge status-' + doc.status">{{ doc.status }}</span>
                </span>
                <span class="meta-item">
                  <span class="meta-label">Fields:</span> {{ doc.totalFields }}
                </span>
                <span class="meta-item">
                  <span class="meta-label">Model:</span>
                  <span class="model-badge" [title]="doc.modelSource || ''">{{ shortModelName(doc.modelSource) }}</span>
                </span>
              </div>
            </div>
          </div>

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
  styles: [`
    .model-badge {
      font-size: 0.7rem;
      background: #ede7f6;
      color: #4a148c;
      border-radius: 4px;
      padding: 0.1rem 0.4rem;
      font-family: monospace;
      white-space: nowrap;
      overflow: hidden;
      max-width: 110px;
      display: inline-block;
      text-overflow: ellipsis;
      vertical-align: middle;
    }
    .bulk-bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 1rem;
      margin-bottom: 1rem;
      background: #e3f2fd;
      border: 1px solid #90caf9;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      color: #1565c0;
      flex-wrap: wrap;
    }
    .bulk-btn {
      border: none;
      border-radius: 6px;
      padding: 0.35rem 0.9rem;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .bulk-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .bulk-btn.reviewed { background: #c8e6c9; color: #2e7d32; }
    .bulk-btn.reviewed:hover:not(:disabled) { background: #a5d6a7; }
    .bulk-btn.approved { background: #bbdefb; color: #1565c0; }
    .bulk-btn.approved:hover:not(:disabled) { background: #90caf9; }
    .bulk-btn.clear { background: #eee; color: #555; }
    .bulk-btn.clear:hover { background: #ddd; }
    .row-selected { background: #e3f2fd !important; }
    input[type="checkbox"] { cursor: pointer; width: 16px; height: 16px; accent-color: #1565c0; }
    .doc-type-badge {
      font-size: 0.7rem;
      background: #e3f2fd;
      color: #1565c0;
      border-radius: 4px;
      padding: 0.1rem 0.4rem;
      white-space: nowrap;
    }
    .doc-type-badge.pptx {
      background: #fce4ec;
      color: #880e4f;
    }
  `],
})
export class DashboardPage implements OnInit {
  allDocs: DocumentSummary[] = [];
  stats: ConfidenceStats | null = null;
  retraining: RetrainingStatus | null = null;
  customModel: CustomModelStatus | null = null;
  groupedDocs: DocGroup[] = [];
  loading = true;
  error = '';
  categoryFilter = 'All';
  reviewFilter: 'all' | 'reviewed' | 'not-reviewed' = 'all';
  stateFilter = 'All';
  docTypeFilter = 'All';
  states: string[] = [];
  stateNameMap: Record<string, string> = {};
  categoryLabels = CATEGORY_LABELS;
  statKeys: ('blue' | 'green' | 'yellow' | 'red')[] = ['blue', 'green', 'yellow', 'red'];
  pageSize = PAGE_SIZE;
  selectedIds = new Set<string>();
  bulkLoading = false;

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



  shortModelName(modelSource: string | null): string {
    if (!modelSource) return 'layout';
    if (modelSource.startsWith('prebuilt-')) return modelSource.replace('prebuilt-', '');
    // Custom model IDs can be long; truncate to last 12 chars with prefix
    return modelSource.length > 16 ? '…' + modelSource.slice(-12) : modelSource;
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

  // --- Multi-select ---
  toggleDocSelection(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  toggleGroupSelection(group: DocGroup, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const pageDocs = this.getPageDocs(group);
    for (const doc of pageDocs) {
      if (checked) {
        this.selectedIds.add(doc.id);
      } else {
        this.selectedIds.delete(doc.id);
      }
    }
  }

  isGroupAllSelected(group: DocGroup): boolean {
    const pageDocs = this.getPageDocs(group);
    return pageDocs.length > 0 && pageDocs.every(d => this.selectedIds.has(d.id));
  }

  isGroupIndeterminate(group: DocGroup): boolean {
    const pageDocs = this.getPageDocs(group);
    const selectedCount = pageDocs.filter(d => this.selectedIds.has(d.id)).length;
    return selectedCount > 0 && selectedCount < pageDocs.length;
  }

  clearSelection(): void {
    this.selectedIds.clear();
  }

  bulkSetStatus(status: 'reviewed' | 'approved'): void {
    const ids = Array.from(this.selectedIds);
    if (ids.length === 0) return;
    this.bulkLoading = true;
    this.api.bulkUpdateStatus(ids, status, 'dashboard-user').subscribe({
      next: () => {
        this.selectedIds.clear();
        this.bulkLoading = false;
        this.loadData();
      },
      error: () => {
        alert('Failed to update documents');
        this.bulkLoading = false;
      },
    });
  }

  private loadData(): void {
    this.loading = true;
    forkJoin([
      this.api.getDocuments(),
      this.api.getConfidenceStats().pipe(catchError(() => of({ blue: 0, green: 0, yellow: 0, red: 0, total: 0 } as ConfidenceStats))),
      this.api.getRetrainingStats().pipe(catchError(() => of(null))),
      this.api.getCustomModelStatus().pipe(catchError(() => of(null))),
    ]).subscribe({
      next: ([docs, stats, retraining, customModel]) => {
        this.allDocs = docs;
        this.stats = stats;
        this.retraining = retraining;
        this.customModel = customModel;
        this.stateNameMap = {};
        for (const d of docs) {
          if (d.state && d.stateName) this.stateNameMap[d.state] = d.stateName;
        }
        this.states = [...new Set(docs.map(d => d.state))].filter(s => !!s).sort();
        this.applyFilters();
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load data';
        this.loading = false;
      },
    });
  }

  applyFilters(): void {
    let filtered = [...this.allDocs];

    if (this.categoryFilter !== 'All') {
      filtered = filtered.filter(d => d.confidenceCategory === this.categoryFilter);
    }
    if (this.stateFilter !== 'All') {
      filtered = filtered.filter(d => d.state === this.stateFilter);
    }
    if (this.docTypeFilter !== 'All') {
      if (this.docTypeFilter === 'pdf') {
        filtered = filtered.filter(d => !d.documentType || d.documentType === 'pdf');
      } else {
        filtered = filtered.filter(d => d.documentType === this.docTypeFilter);
      }
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
