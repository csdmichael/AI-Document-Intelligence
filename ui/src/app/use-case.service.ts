import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type UseCase = 'tax-forms' | 'eng-docs';

@Injectable({ providedIn: 'root' })
export class UseCaseService {
  private useCaseSubject = new BehaviorSubject<UseCase>('tax-forms');
  useCase$ = this.useCaseSubject.asObservable();

  get useCase(): UseCase {
    return this.useCaseSubject.value;
  }

  setUseCase(value: UseCase): void {
    this.useCaseSubject.next(value);
  }
}
