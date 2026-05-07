import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  IonApp,
  IonSplitPane,
  IonMenu,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonIcon,
  IonLabel,
  IonMenuButton,
  IonButtons,
  IonFooter,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { gridOutline, documentTextOutline, informationCircleOutline, cloudOutline } from 'ionicons/icons';
import { UseCaseService, UseCase } from './use-case.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    FormsModule,
    IonApp,
    IonSplitPane,
    IonMenu,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonIcon,
    IonLabel,
    IonMenuButton,
    IonButtons,
    RouterOutlet,
    IonFooter,
    IonSelect,
    IonSelectOption,
  ],
  template: `
    <ion-app>
      <ion-split-pane contentId="main-content">
        <!-- Left Side Menu -->
        <ion-menu contentId="main-content" type="overlay">
          <ion-header>
            <ion-toolbar color="primary">
              <ion-title>Navigation</ion-title>
            </ion-toolbar>
          </ion-header>
          <ion-content>
            <ion-list>
              <ion-item routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" lines="full" detail="false" button>
                <ion-icon name="grid-outline" slot="start"></ion-icon>
                <ion-label>Dashboard</ion-label>
              </ion-item>
              <ion-item routerLink="/blob-files" routerLinkActive="active" lines="full" detail="false" button>
                <ion-icon name="cloud-outline" slot="start"></ion-icon>
                <ion-label>Blob Storage</ion-label>
              </ion-item>
            </ion-list>
          </ion-content>
        </ion-menu>

        <!-- Main Content -->
        <div class="ion-page" id="main-content">
          <ion-header>
            <ion-toolbar color="primary">
              <ion-buttons slot="start">
                <ion-menu-button></ion-menu-button>
              </ion-buttons>
              <ion-title>
                <div style="display: flex; align-items: center;">
                  <img src="https://img.icons8.com/color/48/microsoft.png"
                       alt="Microsoft"
                       class="ms-logo" />
                  AI Document Intelligence
                </div>
              </ion-title>
            </ion-toolbar>
            <!-- Use Case filter row — always visible on all screen sizes -->
            <ion-toolbar color="primary" class="use-case-toolbar">
              <div class="use-case-bar">
                <span class="use-case-label">Use Case:</span>
                <ion-select
                  class="use-case-ionic-select"
                  [(ngModel)]="selectedUseCase"
                  (ngModelChange)="onUseCaseChange($event)"
                  interface="popover"
                  [interfaceOptions]="{ cssClass: 'use-case-popover' }"
                  aria-label="Use Case">
                  <ion-select-option value="tax-forms">📋 Tax Forms</ion-select-option>
                  <ion-select-option value="eng-docs">🔧 Eng Docs</ion-select-option>
                </ion-select>
              </div>
            </ion-toolbar>
          </ion-header>

          <ion-content [fullscreen]="false" style="--padding-top: 0.5rem;">
            <router-outlet></router-outlet>
          </ion-content>

          <ion-footer>
            <div class="app-footer">
              &copy; {{ currentYear }} Michael Yaacoub - Sr Solution Engineer &#64; Microsoft |
              <a href="https://www.github.com/csdmichael" target="_blank" rel="noopener noreferrer">GitHub</a> |
              <a href="https://www.linkedin.com/in/michael-yaacoub-7a46436/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            </div>
          </ion-footer>
        </div>
      </ion-split-pane>
    </ion-app>
  `,
  styles: [`
    .use-case-toolbar {
      --min-height: 38px;
      --padding-top: 0;
      --padding-bottom: 0;
      border-top: 1px solid rgba(255,255,255,0.15);
    }
    .use-case-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0 1rem;
    }
    .use-case-label {
      font-size: 0.8rem;
      color: rgba(255,255,255,0.85);
      white-space: nowrap;
    }
    .use-case-ionic-select {
      --color: #fff;
      --placeholder-color: rgba(255,255,255,0.85);
      --padding-start: 0.5rem;
      --padding-end: 0.5rem;
      font-size: 0.82rem;
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.4);
      border-radius: 6px;
      max-width: 180px;
    }
  `],
})
export class AppComponent {
  currentYear = new Date().getFullYear();
  selectedUseCase: UseCase = 'tax-forms';

  constructor(private useCaseService: UseCaseService) {
    addIcons({ gridOutline, documentTextOutline, informationCircleOutline, cloudOutline });
  }

  onUseCaseChange(value: UseCase): void {
    this.useCaseService.setUseCase(value);
  }
}
