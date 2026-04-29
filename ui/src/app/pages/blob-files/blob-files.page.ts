import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonSpinner } from '@ionic/angular/standalone';
import { forkJoin, catchError, of } from 'rxjs';
import { ApiService } from '../../api.service';
import { BlobFile, DocumentSummary, CATEGORY_COLORS } from '../../models';

const PAGE_SIZE = 20;

interface BlobRow {
  name: string;
  size: number;
  lastModified: string;
  url: string;
  stateAbbr: string;
  stateName: string;
  tier: string;
  parsed: boolean;
  document: DocumentSummary | null;
}

@Component({
  selector: 'app-blob-files',
  standalone: true,
  imports: [CommonModule, FormsModule, IonSpinner],
  template: `
    <div class="page-container" style="padding: 1.5rem; max-width: 1400px; margin: 0 auto; height: 100vh; overflow-y: auto; box-sizing: border-box;">
      <div *ngIf="loading" style="text-align: center; padding: 3rem;">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Loading blob files...</p>
      </div>

      <div *ngIf="error" style="color: #c62828; padding: 1rem; background: #ffebee; border-radius: 8px; margin-bottom: 1rem;">
        Error: {{ error }}
      </div>

      <ng-container *ngIf="!loading">
        <!-- KPI Stats Bar -->
        <div class="stats-bar">
          <div class="stat-card clickable" style="background: #0078d4;"
               [class.selected]="parseFilter === 'all'"
               (click)="setParseFilter('all')">
            <div class="count">{{ allRows.length }}</div>
            <div class="label">Total Blobs</div>
          </div>
          <div class="stat-card clickable" style="background: #2e7d32;"
               [class.selected]="parseFilter === 'parsed'"
               (click)="setParseFilter('parsed')">
            <div class="count">{{ parsedCount }}</div>
            <div class="label">Parsed</div>
          </div>
          <div class="stat-card clickable" style="background: #e65100;"
               [class.selected]="parseFilter === 'unparsed'"
               (click)="setParseFilter('unparsed')">
            <div class="count">{{ unparsedCount }}</div>
            <div class="label">Not Parsed</div>
          </div>
          <div class="stat-card" style="background: #555;">
            <div class="count">{{ totalSizeMB }}</div>
            <div class="label">Total Size (MB)</div>
          </div>
        </div>

        <!-- Confidence Distribution (parsed only) -->
        <div *ngIf="parsedCount > 0" class="card" style="margin-bottom: 1rem;">
          <h3 style="margin: 0 0 0.6rem; font-size: 0.95rem; color: #004578;">Confidence Distribution (Parsed Documents)</h3>
          <div class="conf-dist-bar">
            <div *ngFor="let seg of confSegments"
                 class="conf-segment"
                 [style.flex]="seg.count"
                 [style.background]="seg.color"
                 [title]="seg.label + ': ' + seg.count">
              <span *ngIf="seg.count > 0">{{ seg.count }}</span>
            </div>
          </div>
          <div class="conf-legend">
            <span *ngFor="let seg of confSegments" class="conf-legend-item">
              <span class="conf-dot" [style.background]="seg.color"></span>
              {{ seg.label }} ({{ seg.count }})
            </span>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="filter-bar">
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <input type="text" class="search-input" placeholder="Search file name..."
                   [(ngModel)]="searchTerm" (ngModelChange)="applyFilters()" />
            <select class="state-select" [value]="stateFilter" (change)="stateFilter = $any($event.target).value; applyFilters()">
              <option value="All">All States</option>
              <option *ngFor="let s of states" [value]="s">{{ s }}</option>
            </select>
            <select class="state-select" [value]="tierFilter" (change)="tierFilter = $any($event.target).value; applyFilters()">
              <option value="All">All Tiers</option>
              <option value="blue">Blue (Clean)</option>
              <option value="green">Green (Slight)</option>
              <option value="yellow">Yellow (Moderate)</option>
              <option value="red">Red (Heavy)</option>
              <option value="standard">Standard</option>
            </select>
          </div>
          <span style="font-size: 0.8rem; color: #888;">{{ filteredRows.length }} files shown</span>
        </div>

        <!-- Desktop/Tablet: Table -->
        <div class="desktop-table table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>File Name</th>
                <th>State</th>
                <th>Size</th>
                <th>Last Modified</th>
                <th>Parsed</th>
                <th>Confidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of pagedRows; let i = index"
                  style="cursor: pointer;"
                  (click)="onRowClick(row)">
                <td>{{ (page - 1) * pageSize + i + 1 }}</td>
                <td><span class="doc-link">{{ row.name }}</span></td>
                <td>{{ row.stateName }} ({{ row.stateAbbr }})</td>
                <td>{{ formatSize(row.size) }}</td>
                <td>{{ row.lastModified | date:'short' }}</td>
                <td>
                  <span *ngIf="row.parsed" class="parsed-yes">✓ Yes</span>
                  <span *ngIf="!row.parsed" class="parsed-no">✗ No</span>
                </td>
                <td>
                  <span *ngIf="row.document" [class]="'badge ' + row.document.confidenceCategory">
                    {{ (row.document.overallConfidence * 100).toFixed(1) }}%
                  </span>
                  <span *ngIf="!row.document" style="color: #bbb;">—</span>
                </td>
                <td>
                  <span *ngIf="row.document" [class]="'status-badge status-' + row.document.status">
                    {{ row.document.status }}
                  </span>
                  <span *ngIf="!row.document" style="color: #bbb;">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile: Card view -->
        <div class="mobile-cards">
          <div *ngFor="let row of pagedRows; let i = index"
               class="doc-card-mobile"
               (click)="onRowClick(row)">
            <div class="doc-card-header">
              <span class="doc-card-title">{{ row.name }}</span>
              <span *ngIf="row.parsed" class="parsed-yes">✓</span>
              <span *ngIf="!row.parsed" class="parsed-no">✗</span>
            </div>
            <div class="doc-card-meta">
              <span class="meta-item">{{ row.stateName }}</span>
              <span class="meta-item">{{ formatSize(row.size) }}</span>
              <span *ngIf="row.tier" class="meta-item">
                <span [class]="'badge ' + capitalize(row.tier)" style="font-size: 0.68rem;">{{ row.tier }}</span>
              </span>
              <span *ngIf="row.document" class="meta-item">
                <span [class]="'badge ' + row.document.confidenceCategory" style="font-size: 0.68rem;">
                  {{ (row.document.overallConfidence * 100).toFixed(1) }}%
                </span>
              </span>
              <span *ngIf="row.document" class="meta-item">
                <span [class]="'status-badge status-' + row.document.status" style="font-size: 0.68rem;">{{ row.document.status }}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div *ngIf="totalPages > 1" class="pagination">
          <button class="page-btn" [disabled]="page <= 1" (click)="setPage(page - 1)">‹ Prev</button>
          <ng-container *ngFor="let p of getPageNumbers()">
            <button class="page-btn" [class.active]="p === page" (click)="setPage(p)">{{ p }}</button>
          </ng-container>
          <button class="page-btn" [disabled]="page >= totalPages" (click)="setPage(page + 1)">Next ›</button>
          <span style="color: #888; font-size: 0.75rem; margin-left: 0.5rem;">
            {{ (page - 1) * pageSize + 1 }}–{{ min(page * pageSize, filteredRows.length) }} of {{ filteredRows.length }}
          </span>
        </div>

        <div *ngIf="filteredRows.length === 0 && !loading" class="card" style="text-align: center; color: #999; padding: 2rem;">
          No blob files match the current filters.
        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    .parsed-yes {
      color: #2e7d32;
      font-weight: 600;
      font-size: 0.82rem;
    }
    .parsed-no {
      color: #c62828;
      font-weight: 600;
      font-size: 0.82rem;
    }
    .search-input {
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 0.35rem 0.7rem;
      font-size: 0.82rem;
      min-width: 180px;
    }
    .search-input:focus {
      outline: none;
      border-color: #0078d4;
      box-shadow: 0 0 0 2px rgba(0,120,212,0.15);
    }
    .conf-dist-bar {
      display: flex;
      height: 28px;
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 0.5rem;
    }
    .conf-segment {
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 0.75rem;
      font-weight: 600;
      min-width: 0;
      transition: flex 0.3s;
    }
    .conf-legend {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      font-size: 0.78rem;
      color: #555;
    }
    .conf-legend-item {
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }
    .conf-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }
    @media (max-width: 767px) {
      .search-input { min-width: 120px; width: 100%; }
      .conf-legend { font-size: 0.7rem; gap: 0.5rem; }
    }
  `],
})
export class BlobFilesPage implements OnInit {
  allRows: BlobRow[] = [];
  filteredRows: BlobRow[] = [];
  pagedRows: BlobRow[] = [];
  loading = true;
  error = '';

  searchTerm = '';
  stateFilter = 'All';
  tierFilter = 'All';
  parseFilter: 'all' | 'parsed' | 'unparsed' = 'all';
  states: string[] = [];

  parsedCount = 0;
  unparsedCount = 0;
  totalSizeMB = '0.0';

  page = 1;
  pageSize = PAGE_SIZE;
  totalPages = 1;

  confSegments: { label: string; count: number; color: string }[] = [];

  private docMap = new Map<string, DocumentSummary>();

  private stateMap: Record<string, string> = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
    MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
    NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
    ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
    RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
    TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
    WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  };

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit(): void {
    this.loadData();
  }

  setParseFilter(f: 'all' | 'parsed' | 'unparsed'): void {
    this.parseFilter = f;
    this.applyFilters();
  }

  onRowClick(row: BlobRow): void {
    if (row.document) {
      this.router.navigate(['/documents', row.document.id]);
    }
  }

  capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  min(a: number, b: number): number {
    return Math.min(a, b);
  }

  setPage(p: number): void {
    if (p >= 1 && p <= this.totalPages) {
      this.page = p;
      this.updatePagedRows();
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.page - 2);
    const end = Math.min(this.totalPages, this.page + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  applyFilters(): void {
    let rows = [...this.allRows];

    if (this.parseFilter === 'parsed') rows = rows.filter(r => r.parsed);
    else if (this.parseFilter === 'unparsed') rows = rows.filter(r => !r.parsed);

    if (this.stateFilter !== 'All') rows = rows.filter(r => r.stateAbbr === this.stateFilter);
    if (this.tierFilter !== 'All') {
      if (this.tierFilter === 'standard') rows = rows.filter(r => !r.tier);
      else rows = rows.filter(r => r.tier === this.tierFilter);
    }

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(term));
    }

    this.filteredRows = rows;
    this.page = 1;
    this.totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    this.updatePagedRows();
  }

  private updatePagedRows(): void {
    const start = (this.page - 1) * PAGE_SIZE;
    this.pagedRows = this.filteredRows.slice(start, start + PAGE_SIZE);
  }

  private loadData(): void {
    this.loading = true;
    forkJoin([
      this.api.getBlobs().pipe(catchError(() => of([] as BlobFile[]))),
      this.api.getDocuments().pipe(catchError(() => of([] as DocumentSummary[]))),
    ]).subscribe({
      next: ([blobs, docs]) => {
        // Build doc map by fileName
        this.docMap.clear();
        for (const d of docs) this.docMap.set(d.fileName, d);

        // Build rows
        this.allRows = blobs.map(b => {
          const parsed = this.extractFromFilename(b.name);
          const doc = this.docMap.get(b.name) || null;
          return {
            ...b,
            stateAbbr: parsed.stateAbbr,
            stateName: parsed.stateName,
            tier: parsed.tier,
            parsed: !!doc,
            document: doc,
          };
        }).sort((a, b) => a.name.localeCompare(b.name));

        this.parsedCount = this.allRows.filter(r => r.parsed).length;
        this.unparsedCount = this.allRows.length - this.parsedCount;
        this.totalSizeMB = (this.allRows.reduce((s, r) => s + r.size, 0) / (1024 * 1024)).toFixed(1);
        this.states = [...new Set(this.allRows.map(r => r.stateAbbr))].sort();

        // Confidence distribution
        const cats: Record<string, number> = { Blue: 0, Green: 0, Yellow: 0, Red: 0 };
        for (const r of this.allRows) {
          if (r.document) cats[r.document.confidenceCategory] = (cats[r.document.confidenceCategory] || 0) + 1;
        }
        this.confSegments = [
          { label: 'Blue (>90%)', count: cats['Blue'], color: CATEGORY_COLORS['Blue'] },
          { label: 'Green (80-90%)', count: cats['Green'], color: CATEGORY_COLORS['Green'] },
          { label: 'Yellow (60-80%)', count: cats['Yellow'], color: CATEGORY_COLORS['Yellow'] },
          { label: 'Red (<60%)', count: cats['Red'], color: CATEGORY_COLORS['Red'] },
        ];

        this.applyFilters();
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load blob files';
        this.loading = false;
      },
    });
  }

  private extractFromFilename(name: string): { stateAbbr: string; stateName: string; tier: string } {
    // Patterns: tax_exemption_CA_001.pdf or lq_tax_exemption_CA_001_blue.pdf
    const base = name.replace('.pdf', '');
    const parts = base.split('_');

    let stateAbbr = 'UNKNOWN';
    let tier = '';

    if (parts[0] === 'lq' && parts.length >= 5) {
      // lq_tax_exemption_CA_001_blue
      stateAbbr = parts[3] || 'UNKNOWN';
      tier = parts[5] || '';
    } else if (parts.length >= 3) {
      // tax_exemption_CA_001
      stateAbbr = parts[2] || 'UNKNOWN';
    }

    return {
      stateAbbr,
      stateName: this.stateMap[stateAbbr] || stateAbbr,
      tier,
    };
  }
}
