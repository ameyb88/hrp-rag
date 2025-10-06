import { Component, Input } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'ragu-chat',
  templateUrl: './rag-chat.component.html',
  styleUrls: ['./rag-chat.component.css'],
})
export class RagChatComponent {
  @Input() apiBase = '/api'; // configurable; no secrets in UI
  input = '';
  loading = false;
  messages: { role: 'user' | 'assistant'; text: string; shots?: string[] }[] =
    [];

  constructor(private http: HttpClient) {}

  async send() {
    const q = this.input.trim();
    if (!q) return;
    this.messages.push({ role: 'user', text: q });
    this.input = '';
    this.loading = true;
    try {
      const res = await this.http
        .post<{ answer: string; screenshots: string[] }>(
          `${this.apiBase}/ask`,
          { query: q }
        )
        .toPromise();
      this.messages.push({
        role: 'assistant',
        text: res?.answer || '(no answer)',
        shots: res?.screenshots || [],
      });
    } catch (e: any) {
      this.messages.push({
        role: 'assistant',
        text: '❌ ' + (e?.message || 'Request failed'),
      });
    } finally {
      this.loading = false;
    }
  }
}
