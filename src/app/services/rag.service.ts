import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class RagService {
  private base = 'http://localhost:8080/api';
  constructor(private http: HttpClient) {}
  ask(query: string) {
    return this.http.post<{ answer: string; screenshots: string[] }>(
      `${this.base}/ask`,
      { query }
    );
  }
}
