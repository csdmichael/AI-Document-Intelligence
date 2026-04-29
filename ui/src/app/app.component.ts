import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { gridOutline, documentTextOutline, informationCircleOutline } from 'ionicons/icons';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
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
          </ion-header>

          <ion-content>
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
})
export class AppComponent {
  currentYear = new Date().getFullYear();

  constructor() {
    addIcons({ gridOutline, documentTextOutline, informationCircleOutline });
  }
}
