import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  IonSpinner,
  IonButton,
} from '@ionic/angular/standalone';
import { ApiService } from '../../api.service';
import { DocumentDetail, Field, Section } from '../../models';

@Component({
  selector: 'app-document-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, IonSpinner, IonButton],
  template: `
    <div style="padding: 1.5rem; max-width: 1200px; margin: 0 auto;">
      <div *ngIf="loading" style="text-align: center; padding: 3rem;">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Loading document...</p>
      </div>

      <div *ngIf="error" style="color: #c62828; padding: 1rem; background: #ffebee; border-radius: 8px;">
        Error: {{ error }}
      </div>

      <ng-container *ngIf="!loading && !error && doc">
        <a class="doc-link" routerLink="/parsed" style="display: inline-block; margin-bottom: 1rem; font-size: 0.9rem;">
          ← Back to Parsed Documents
        </a>

        <!-- Document Header -->
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
              <h2>{{ doc.fileName }}</h2>
              <p style="color: #666; font-size: 0.85rem;">
                {{ doc.stateName }} ({{ doc.state }}) &bull; Status: <strong>{{ doc.status }}</strong>
              </p>
            </div>
            <div style="text-align: right;">
              <span [class]="'badge ' + doc.confidenceCategory">
                {{ doc.confidenceCategory }} {{ (doc.overallConfidence * 100).toFixed(1) }}%
              </span>
              <p style="color: #888; font-size: 0.75rem; margin-top: 0.3rem;">{{ doc.confidenceLabel }}</p>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 1rem; margin-top: 1rem; font-size: 0.85rem;">
            <div><strong>Sections:</strong> {{ doc.totalSections }}</div>
            <div><strong>Fields:</strong> {{ doc.totalFields }}</div>
            <div><strong>Parsed:</strong> {{ doc.parsedAt ? (doc.parsedAt | date:'medium') : '-' }}</div>
            <div>
              <strong>Reviewed:</strong>
              {{ doc.reviewedBy ? doc.reviewedBy + ' on ' + (doc.reviewedAt | date:'shortDate') : 'Not yet' }}
            </div>
          </div>

          <ion-button *ngIf="doc.status !== 'approved'"
                      color="success"
                      style="margin-top: 1rem;"
                      (click)="handleApprove()">
            ✓ Approve Document
          </ion-button>
        </div>

        <!-- Sections -->
        <div class="card">
          <h2>Sections</h2>
          <div *ngFor="let section of doc.sections"
               [class]="'section-card ' + section.confidenceCategory"
               (click)="toggleSection(section.sectionIndex)">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong>{{ section.sectionName }}</strong>
                <span style="color: #888; font-size: 0.8rem; margin-left: 0.5rem;">
                  ({{ section.fields.length }} fields)
                </span>
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span [class]="'badge ' + section.confidenceCategory">
                  {{ section.confidenceCategory }} {{ (section.sectionConfidence * 100).toFixed(1) }}%
                </span>
                <span style="font-size: 0.8rem; color: #888;">
                  {{ expandedSection === section.sectionIndex ? '▲' : '▼' }}
                </span>
              </div>
            </div>

            <!-- Expanded Section Fields -->
            <div *ngIf="expandedSection === section.sectionIndex"
                 style="margin-top: 0.8rem;"
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
                  <tr *ngFor="let field of section.fields">
                    <td style="font-weight: 500;">{{ field.fieldName }}</td>
                    <td>{{ field.extractedValue || '' }}<em *ngIf="!field.extractedValue" style="color: #999;">empty</em></td>
                    <td>
                      <span [class]="'badge ' + field.confidenceCategory">
                        {{ field.confidenceCategory }} {{ (field.confidence * 100).toFixed(1) }}%
                      </span>
                    </td>
                    <td>
                      <span *ngIf="field.correctedValue" style="color: #2e7d32; font-weight: 500;">
                        {{ field.correctedValue }}<br/>
                        <small style="color: #888;">by {{ field.correctedBy }} on {{ field.correctedAt | date:'shortDate' }}</small>
                      </span>
                      <span *ngIf="!field.correctedValue" style="color: #999;">—</span>
                    </td>
                    <td>
                      <!-- Inline editor -->
                      <ng-container *ngIf="editingField?.sectionIndex !== section.sectionIndex || editingField?.fieldName !== field.fieldName">
                        <button style="background: #0078d4; color: white; border: none; border-radius: 6px; padding: 0.3rem 0.8rem; font-size: 0.8rem; cursor: pointer;"
                                (click)="startEdit(section.sectionIndex, field)">
                          Edit
                        </button>
                      </ng-container>
                      <ng-container *ngIf="editingField?.sectionIndex === section.sectionIndex && editingField?.fieldName === field.fieldName">
                        <div style="display: flex; gap: 0.3rem; align-items: center;">
                          <input type="text" [(ngModel)]="editValue"
                                 style="min-width: 120px; border: 1px solid #ccc; border-radius: 4px; padding: 0.35rem 0.5rem; font-size: 0.85rem;" />
                          <button style="background: #2e7d32; color: white; border: none; border-radius: 6px; padding: 0.3rem 0.8rem; font-size: 0.8rem; cursor: pointer;"
                                  [disabled]="saving"
                                  (click)="saveEdit(section.sectionIndex, field.fieldName)">
                            {{ saving ? '...' : 'Save' }}
                          </button>
                          <button style="background: #eee; border: none; border-radius: 6px; padding: 0.3rem 0.8rem; font-size: 0.8rem; cursor: pointer;"
                                  (click)="cancelEdit()">
                            Cancel
                          </button>
                        </div>
                      </ng-container>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
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

  private docId = '';

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit(): void {
    this.docId = this.route.snapshot.paramMap.get('id') || '';
    this.loadDoc();
  }

  toggleSection(index: number): void {
    this.expandedSection = this.expandedSection === index ? null : index;
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
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load document';
        this.loading = false;
      },
    });
  }
}
