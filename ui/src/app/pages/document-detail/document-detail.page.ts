import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonSpinner, IonButton } from '@ionic/angular/standalone';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from '../../api.service';
import { DocumentDetail, Field, Section, CATEGORY_COLORS } from '../../models';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-document-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, IonSpinner, IonButton],
  template: `
    <div class="page-container" style="padding: 1rem; max-width: 100%; margin: 0 auto;">
      <div *ngIf="loading" style="text-align: center; padding: 3rem;">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Loading document...</p>
      </div>

      <div *ngIf="error" style="color: #c62828; padding: 1rem; background: #ffebee; border-radius: 8px;">
        Error: {{ error }}
      </div>

      <ng-container *ngIf="!loading && !error && doc">
        <!-- Header Bar -->
        <div class="detail-header">
          <div class="detail-header-left">
            <a class="doc-link" routerLink="/" style="font-size: 0.9rem;">← Back</a>
            <h2 class="detail-title">{{ doc.fileName }}</h2>
            <span class="detail-state">{{ doc.stateName }} ({{ doc.state }})</span>
            <span [class]="'status-badge status-' + doc.status">{{ doc.status }}</span>
          </div>
          <div class="detail-header-right">
            <span [class]="'badge ' + doc.confidenceCategory" style="font-size: 0.95rem; padding: 0.25rem 0.8rem;">
              {{ doc.confidenceCategory }} {{ (doc.overallConfidence * 100).toFixed(1) }}%
            </span>
            <!-- Model source badge -->
            <span *ngIf="doc.modelSource" style="font-size: 0.72rem; background: #ede7f6; color: #4a148c; border-radius: 4px; padding: 0.15rem 0.5rem; font-family: monospace;" [title]="doc.modelSource">
              {{ shortModel(doc.modelSource) }}
            </span>
            <div class="kpi-mini">
              <span class="kpi-value">{{ doc.totalFields }}</span>
              <span class="kpi-label">Fields</span>
            </div>
            <div class="kpi-mini">
              <span class="kpi-value">{{ correctedFieldCount }}</span>
              <span class="kpi-label">Corrected</span>
            </div>
            <ion-button *ngIf="doc.status !== 'approved'"
                        color="success" size="small"
                        style="--background: #2e7d32; --color: #fff;"
                        (click)="handleApprove()">
              ✓ Approve
            </ion-button>
            <span *ngIf="doc.status === 'approved'" style="color: #2e7d32; font-weight: 600; font-size: 0.85rem;">
              ✓ Approved
            </span>
          </div>
        </div>

        <!-- Model Comparison Card (shown when --compare was used during parsing) -->
        <div *ngIf="doc.modelComparison" class="comparison-card">
          <div style="font-weight: 600; font-size: 0.85rem; color: #555; margin-bottom: 0.4rem;">
            🔍 Model Comparison
          </div>
          <div style="display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center;">
            <!-- Primary model -->
            <div class="cmp-block">
              <div class="cmp-label">Primary Model</div>
              <code class="cmp-model">{{ doc.modelSource || 'prebuilt-layout' }}</code>
              <span [class]="'badge ' + doc.confidenceCategory" style="font-size: 0.78rem; margin-left: 0.5rem;">
                {{ (doc.overallConfidence * 100).toFixed(1) }}%
              </span>
            </div>
            <!-- vs divider -->
            <div style="color: #aaa; font-size: 1.1rem;">↔</div>
            <!-- Comparison model -->
            <div class="cmp-block">
              <div class="cmp-label">OCR / Read Model</div>
              <code class="cmp-model">{{ doc.modelComparison.modelId }}</code>
              <ng-container *ngIf="doc.modelComparison.overallConfidence !== null; else cmpError">
                <span [class]="'badge ' + doc.modelComparison.confidenceCategory" style="font-size: 0.78rem; margin-left: 0.5rem;">
                  {{ (doc.modelComparison.overallConfidence! * 100).toFixed(1) }}%
                </span>
                <span style="font-size: 0.74rem; color: #888; margin-left: 0.4rem;">
                  ({{ doc.modelComparison.totalWords }} words)
                </span>
              </ng-container>
              <ng-template #cmpError>
                <span style="color: #c62828; font-size: 0.78rem; margin-left: 0.5rem;">
                  ⚠ {{ doc.modelComparison.error }}
                </span>
              </ng-template>
            </div>
            <!-- Delta -->
            <div *ngIf="doc.modelComparison.overallConfidence !== null" class="cmp-block">
              <div class="cmp-label">Δ Confidence</div>
              <span [style.color]="getDeltaColor(doc.overallConfidence - doc.modelComparison.overallConfidence!)"
                    style="font-weight: 700; font-size: 0.9rem;">
                {{ deltaSign(doc.overallConfidence - doc.modelComparison.overallConfidence!) }}
                {{ (Math.abs(doc.overallConfidence - doc.modelComparison.overallConfidence!) * 100).toFixed(1) }}%
              </span>
            </div>
          </div>
        </div>

        <!-- Split Pane: PDF Left | Fields Right -->
        <div class="split-pane">
          <!-- Left: PDF Viewer -->
          <div class="split-left">
            <div class="pdf-container">
              <iframe *ngIf="pdfUrl" [src]="pdfUrl" class="pdf-frame"></iframe>
              <div *ngIf="!pdfUrl" style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">
                <p>PDF preview not available</p>
              </div>
            </div>
          </div>

          <!-- Right: Parsed Sections & Fields -->
          <div class="split-right">
            <!-- Sections -->
            <div *ngFor="let section of doc.sections" class="section-panel" [style.border-left-color]="getSectionColor(section)">
              <div class="section-header" (click)="toggleSection(section.sectionIndex)">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <strong>{{ section.sectionName }}</strong>
                  <span style="color: #888; font-size: 0.75rem;">({{ section.fields.length }} fields)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <div class="kpi-mini">
                    <span class="kpi-value" [style.color]="getSectionColor(section)">{{ (section.sectionConfidence * 100).toFixed(1) }}%</span>
                    <span class="kpi-label">Score</span>
                  </div>
                  <div class="kpi-mini">
                    <span class="kpi-value">{{ getCorrectedCount(section) }}/{{ section.fields.length }}</span>
                    <span class="kpi-label">Fixed</span>
                  </div>
                  <span [class]="'badge ' + section.confidenceCategory" style="font-size: 0.7rem;">
                    {{ section.confidenceCategory }}
                  </span>
                  <span style="font-size: 0.75rem; color: #888;">
                    {{ expandedSection === section.sectionIndex ? '▲' : '▼' }}
                  </span>
                </div>
              </div>

              <!-- Fields Table -->
              <div *ngIf="expandedSection === section.sectionIndex" class="fields-panel" (click)="$event.stopPropagation()">
                <div *ngFor="let field of section.fields" class="field-row" [class.corrected]="!!field.correctedValue">
                  <div class="field-name">{{ field.fieldName }}</div>
                  <div class="field-value-area">
                    <div class="field-extracted">
                      <span *ngIf="field.extractedValue">{{ field.extractedValue }}</span>
                      <em *ngIf="!field.extractedValue" style="color: #bbb;">empty</em>
                    </div>
                    <div class="field-confidence">
                      <span [class]="'badge ' + field.confidenceCategory" style="font-size: 0.7rem;">
                        {{ (field.confidence * 100).toFixed(1) }}%
                      </span>
                      <span class="confidence-bar" style="width: 50px;">
                        <span class="confidence-fill" [style.width]="(field.confidence * 100) + '%'"
                              [style.background]="getFieldBarColor(field)"></span>
                      </span>
                    </div>
                  </div>
                  <div class="field-correction">
                    <ng-container *ngIf="editingField?.sectionIndex !== section.sectionIndex || editingField?.fieldName !== field.fieldName">
                      <span *ngIf="field.correctedValue" class="corrected-value">
                        {{ field.correctedValue }}
                        <small>({{ field.correctedBy }})</small>
                      </span>
                      <button class="btn-edit btn-sm" (click)="startEdit(section.sectionIndex, field)">
                        {{ field.correctedValue ? 'Re-edit' : 'Edit' }}
                      </button>
                    </ng-container>
                    <ng-container *ngIf="editingField?.sectionIndex === section.sectionIndex && editingField?.fieldName === field.fieldName">
                      <div class="edit-inline">
                        <input type="text" [(ngModel)]="editValue" class="edit-input" (keydown.enter)="saveEdit(section.sectionIndex, field.fieldName)" />
                        <button class="btn-save btn-sm" [disabled]="saving" (click)="saveEdit(section.sectionIndex, field.fieldName)">
                          {{ saving ? '...' : '✓' }}
                        </button>
                        <button class="btn-cancel btn-sm" (click)="cancelEdit()">✗</button>
                      </div>
                    </ng-container>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    .split-pane {
      display: flex;
      gap: 1rem;
      height: calc(100vh - 180px);
      min-height: 500px;
    }
    .split-left {
      flex: 1;
      min-width: 0;
    }
    .split-right {
      flex: 1;
      min-width: 0;
      overflow-y: auto;
    }
    .pdf-container {
      height: 100%;
      background: #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
    }
    .pdf-frame {
      width: 100%;
      height: 100%;
      border: none;
    }
    .section-panel {
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      margin-bottom: 0.6rem;
      border-left: 4px solid #ccc;
      overflow: hidden;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0.8rem;
      cursor: pointer;
      background: #fafafa;
      flex-wrap: wrap;
      gap: 0.3rem;
    }
    .section-header:hover { background: #f0f4f8; }
    .fields-panel { padding: 0; }
    .field-row {
      display: grid;
      grid-template-columns: 160px 1fr auto;
      gap: 0.5rem;
      padding: 0.4rem 0.8rem;
      border-bottom: 1px solid #f0f0f0;
      align-items: center;
      font-size: 0.82rem;
    }
    .field-row:hover { background: #fafcff; }
    .field-row.corrected { background: #f1f8e9; }
    .field-name {
      font-weight: 600;
      color: #333;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .field-value-area {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .field-extracted {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .field-confidence {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      flex-shrink: 0;
    }
    .field-correction {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      min-width: 140px;
      justify-content: flex-end;
    }
    .corrected-value {
      color: #2e7d32;
      font-weight: 500;
      font-size: 0.78rem;
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .corrected-value small { color: #888; }
    .edit-inline {
      display: flex;
      gap: 0.2rem;
      align-items: center;
    }
    .edit-input {
      width: 120px;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 0.2rem 0.4rem;
      font-size: 0.8rem;
    }
    .edit-input:focus {
      outline: none;
      border-color: #0078d4;
      box-shadow: 0 0 0 2px rgba(0,120,212,0.15);
    }
    .btn-sm {
      padding: 0.15rem 0.5rem;
      font-size: 0.75rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .btn-edit { background: #0078d4; color: white; }
    .btn-edit:hover { background: #005a9e; }
    .btn-save { background: #2e7d32; color: white; }
    .btn-save:hover { background: #1b5e20; }
    .btn-cancel { background: #eee; color: #333; }
    .btn-cancel:hover { background: #ddd; }

    .comparison-card {
      background: #f8f4ff;
      border: 1px solid #ce93d8;
      border-radius: 8px;
      padding: 0.65rem 1rem;
      margin-bottom: 0.75rem;
      font-size: 0.82rem;
    }
    .cmp-block {
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }
    .cmp-label {
      font-size: 0.72rem;
      color: #888;
      margin-right: 0.3rem;
      white-space: nowrap;
    }
    .cmp-model {
      font-size: 0.72rem;
      background: #ede7f6;
      color: #4a148c;
      border-radius: 3px;
      padding: 0.1rem 0.35rem;
    }

    @media (max-width: 900px) {
      .split-pane { flex-direction: column; height: auto; }
      .split-left { height: 350px; }
      .field-row { grid-template-columns: 1fr; }
      .field-correction { min-width: unset; justify-content: flex-start; }
    }

    /* --- Detail header responsive --- */
    .detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .detail-header-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .detail-title {
      margin: 0;
      font-size: 1.1rem;
      color: #004578;
    }
    .detail-state {
      color: #666;
      font-size: 0.85rem;
    }
    .detail-header-right {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    /* --- MOBILE --- */
    @media (max-width: 767px) {
      .detail-header {
        flex-direction: column;
        align-items: flex-start;
      }
      .detail-header-left {
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .detail-title {
        font-size: 0.9rem;
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .detail-header-right {
        flex-wrap: wrap;
        gap: 0.5rem;
        width: 100%;
      }
      .split-pane { flex-direction: column; height: auto; }
      .split-left { height: 280px; min-height: 280px; }
      .split-right { max-height: none; }
      .field-row {
        grid-template-columns: 1fr !important;
        gap: 0.25rem;
        padding: 0.5rem;
      }
      .field-name { white-space: normal; }
      .field-value-area { flex-wrap: wrap; }
      .field-correction {
        min-width: unset;
        justify-content: flex-start;
        width: 100%;
      }
      .edit-input { width: 100%; min-width: 0; }
      .edit-inline { width: 100%; }
      .section-header { padding: 0.5rem; gap: 0.3rem; }
      .comparison-card { font-size: 0.75rem; padding: 0.5rem; }
      .cmp-block { flex-wrap: wrap; }
    }

    /* --- TABLET --- */
    @media (min-width: 768px) and (max-width: 1024px) {
      .split-pane { gap: 0.5rem; height: calc(100vh - 200px); }
      .split-left { flex: 0.8; }
      .split-right { flex: 1.2; }
      .field-row { grid-template-columns: 130px 1fr auto; font-size: 0.78rem; }
      .field-correction { min-width: 110px; }
      .detail-header-left { flex-wrap: wrap; gap: 0.5rem; }
      .detail-title { font-size: 1rem; }
    }
  `],
})
export class DocumentDetailPage implements OnInit {
  doc: DocumentDetail | null = null;
  pdfUrl: SafeResourceUrl | null = null;
  expandedSection: number | null = 0;
  loading = true;
  error = '';
  editingField: { sectionIndex: number; fieldName: string } | null = null;
  editValue = '';
  saving = false;
  correctedFieldCount = 0;
  Math = Math;

  private docId = '';

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.docId = params.get('id') || '';
      if (this.docId) {
        this.loadDoc();
      }
    });
  }

  toggleSection(index: number): void {
    this.expandedSection = this.expandedSection === index ? null : index;
  }

  getSectionColor(section: Section): string {
    return CATEGORY_COLORS[section.confidenceCategory] || '#ccc';
  }

  getFieldBarColor(field: Field): string {
    return CATEGORY_COLORS[field.confidenceCategory] || '#ccc';
  }

  getCorrectedCount(section: Section): number {
    return section.fields.filter(f => f.correctedValue).length;
  }

  shortModel(modelSource: string | null): string {
    if (!modelSource) return 'layout';
    if (modelSource.startsWith('prebuilt-')) return modelSource.replace('prebuilt-', '');
    return modelSource.length > 16 ? '…' + modelSource.slice(-12) : modelSource;
  }

  getDeltaColor(delta: number): string {
    if (delta > 0.02) return '#2e7d32';
    if (delta < -0.02) return '#c62828';
    return '#888';
  }

  deltaSign(delta: number): string {
    return delta >= 0 ? '+' : '-';
  }

  handleApprove(): void {
    if (!this.doc) return;
    this.api.approveDocument(this.doc.id, 'admin').subscribe({
      next: () => this.loadDoc(),
      error: (err) => (this.error = err.message || 'Approval failed'),
    });
  }

  startEdit(sectionIndex: number, field: Field): void {
    this.editingField = { sectionIndex, fieldName: field.fieldName };
    this.editValue = field.correctedValue || field.extractedValue;
  }

  cancelEdit(): void {
    this.editingField = null;
    this.editValue = '';
  }

  saveEdit(sectionIndex: number, fieldName: string): void {
    if (!this.doc) return;
    this.saving = true;
    this.api.updateField(this.doc.id, sectionIndex, fieldName, this.editValue, 'admin').subscribe({
      next: () => {
        this.saving = false;
        this.editingField = null;
        this.loadDoc();
      },
      error: () => {
        this.saving = false;
        alert('Failed to save correction');
      },
    });
  }

  private loadDoc(): void {
    if (!this.docId) return;
    this.loading = true;
    this.api.getDocumentDetail(this.docId).subscribe({
      next: (data) => {
        this.doc = data;
        this.correctedFieldCount = 0;
        for (const s of data.sections || []) {
          for (const f of s.fields || []) {
            if (f.correctedValue) this.correctedFieldCount++;
          }
        }
        // Build PDF URL from the blob proxy endpoint
        if (data.fileName) {
          const baseUrl = environment.apiBaseUrl || '';
          const pdfPath = `${baseUrl}/api/blobs/${encodeURIComponent(data.fileName)}`;
          this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(pdfPath);
        }
        // Auto-expand first section
        if (data.sections?.length > 0 && this.expandedSection === null) {
          this.expandedSection = data.sections[0].sectionIndex;
        }
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load document';
        this.loading = false;
      },
    });
  }
}
