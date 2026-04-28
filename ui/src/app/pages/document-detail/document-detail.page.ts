import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonSpinner, IonButton } from '@ionic/angular/standalone';
import { ApiService } from '../../api.service';
import { DocumentDetail, Field, Section, CATEGORY_COLORS } from '../../models';

@Component({
  selector: 'app-document-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, IonSpinner, IonButton],
  template: `
    <div style="padding: 1.5rem; max-width: 1400px; margin: 0 auto;">
      <div *ngIf="loading" style="text-align: center; padding: 3rem;">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Loading document...</p>
      </div>

      <div *ngIf="error" style="color: #c62828; padding: 1rem; background: #ffebee; border-radius: 8px;">
        Error: {{ error }}
      </div>

      <ng-container *ngIf="!loading && !error && doc">
        <a class="doc-link" routerLink="/" style="display: inline-block; margin-bottom: 1rem; font-size: 0.9rem;">
          ← Back to Dashboard
        </a>

        <!-- Document Header with KPIs -->
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 1rem;">
            <div>
              <h2 style="margin-bottom: 0.25rem;">{{ doc.fileName }}</h2>
              <p style="color: #666; font-size: 0.85rem; margin: 0;">
                {{ doc.stateName }} ({{ doc.state }}) &bull; Status:
                <span [class]="'status-badge status-' + doc.status">{{ doc.status }}</span>
              </p>
            </div>
            <div style="text-align: right;">
              <span [class]="'badge ' + doc.confidenceCategory" style="font-size: 1rem; padding: 0.3rem 1rem;">
                {{ doc.confidenceCategory }} {{ (doc.overallConfidence * 100).toFixed(1) }}%
              </span>
              <div class="kpi-bar" *ngIf="doc.confidenceLabel" style="margin-top: 0.25rem; color: #888; font-size: 0.75rem;">
                {{ doc.confidenceLabel }}
              </div>
            </div>
          </div>

          <!-- Document-Level KPIs -->
          <div class="doc-kpi-grid">
            <div class="kpi-card">
              <div class="kpi-value">{{ doc.totalSections }}</div>
              <div class="kpi-label">Sections</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-value">{{ doc.totalFields }}</div>
              <div class="kpi-label">Total Fields</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-value">{{ correctedFieldCount }}</div>
              <div class="kpi-label">Corrections</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-value">{{ doc.parsedAt ? (doc.parsedAt | date:'shortDate') : '-' }}</div>
              <div class="kpi-label">Parsed</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-value">{{ doc.reviewedBy || 'Not yet' }}</div>
              <div class="kpi-label">Reviewed By</div>
            </div>
          </div>

          <ion-button *ngIf="doc.status !== 'approved'"
                      color="success" size="small"
                      style="margin-top: 0.75rem;"
                      (click)="handleApprove()">
            ✓ Approve Document
          </ion-button>
          <span *ngIf="doc.status === 'approved'" style="color: #2e7d32; font-weight: 600; margin-top: 0.75rem; display: inline-block;">
            ✓ Approved {{ doc.reviewedAt ? 'on ' + (doc.reviewedAt | date:'shortDate') : '' }}
          </span>
        </div>

        <!-- Sections with KPIs -->
        <div *ngFor="let section of doc.sections" class="card" style="border-left: 4px solid {{ getSectionColor(section) }};">
          <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; flex-wrap: wrap; gap: 0.5rem;"
               (click)="toggleSection(section.sectionIndex)">
            <div>
              <strong style="font-size: 1rem;">{{ section.sectionName }}</strong>
              <span style="color: #888; font-size: 0.8rem; margin-left: 0.5rem;">
                ({{ section.fields.length }} fields)
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
              <!-- Section KPIs -->
              <div class="kpi-mini">
                <span class="kpi-value" [style.color]="getSectionColor(section)">{{ (section.sectionConfidence * 100).toFixed(1) }}%</span>
                <span class="kpi-label">Confidence</span>
              </div>
              <div class="kpi-mini">
                <span class="kpi-value">{{ getCorrectedCount(section) }}/{{ section.fields.length }}</span>
                <span class="kpi-label">Corrected</span>
              </div>
              <span [class]="'badge ' + section.confidenceCategory">
                {{ section.confidenceCategory }}
              </span>
              <span style="font-size: 0.8rem; color: #888;">
                {{ expandedSection === section.sectionIndex ? '▲' : '▼' }}
              </span>
            </div>
          </div>

          <!-- Expanded Section Fields -->
          <div *ngIf="expandedSection === section.sectionIndex"
               style="margin-top: 1rem;"
               (click)="$event.stopPropagation()">
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Extracted Value</th>
                  <th>Confidence</th>
                  <th>Corrected Value</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let field of section.fields"
                    [style.background]="field.correctedValue ? '#f1f8e9' : ''">
                  <td style="font-weight: 500;">
                    {{ field.fieldName }}
                  </td>
                  <td>
                    <span *ngIf="field.extractedValue">{{ field.extractedValue }}</span>
                    <em *ngIf="!field.extractedValue" style="color: #999;">empty</em>
                  </td>
                  <td>
                    <div style="display: flex; align-items: center; gap: 0.4rem;">
                      <span [class]="'badge ' + field.confidenceCategory">
                        {{ (field.confidence * 100).toFixed(1) }}%
                      </span>
                      <span class="confidence-bar">
                        <span class="confidence-fill" [style.width]="(field.confidence * 100) + '%'"
                              [style.background]="getFieldBarColor(field)"></span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span *ngIf="field.correctedValue" style="color: #2e7d32; font-weight: 500;">
                      {{ field.correctedValue }}<br/>
                      <small style="color: #888;">by {{ field.correctedBy }} · {{ field.correctedAt | date:'short' }}</small>
                    </span>
                    <span *ngIf="!field.correctedValue" style="color: #ccc;">—</span>
                  </td>
                  <td>
                    <ng-container *ngIf="editingField?.sectionIndex !== section.sectionIndex || editingField?.fieldName !== field.fieldName">
                      <button class="btn-edit" (click)="startEdit(section.sectionIndex, field)">Edit</button>
                    </ng-container>
                    <ng-container *ngIf="editingField?.sectionIndex === section.sectionIndex && editingField?.fieldName === field.fieldName">
                      <div style="display: flex; gap: 0.3rem; align-items: center;">
                        <input type="text" [(ngModel)]="editValue"
                               style="min-width: 120px; border: 1px solid #ccc; border-radius: 4px; padding: 0.35rem 0.5rem; font-size: 0.85rem;" />
                        <button class="btn-save" [disabled]="saving" (click)="saveEdit(section.sectionIndex, field.fieldName)">
                          {{ saving ? '...' : 'Save' }}
                        </button>
                        <button class="btn-cancel" (click)="cancelEdit()">Cancel</button>
                      </div>
                    </ng-container>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </ng-container>
    </div>
  `,
})
export class DocumentDetailPage implements OnInit {
  doc: DocumentDetail | null = null;
  expandedSection: number | null = null;
  loading = true;
  error = '';
  editingField: { sectionIndex: number; fieldName: string } | null = null;
  editValue = '';
  saving = false;
  correctedFieldCount = 0;

  private docId = '';

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit(): void {
    this.docId = this.route.snapshot.paramMap.get('id') || '';
    this.loadDoc();
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
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load document';
        this.loading = false;
      },
    });
  }
}
