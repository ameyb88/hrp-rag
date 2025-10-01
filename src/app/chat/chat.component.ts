import { Component } from '@angular/core';
import { RagService } from '../services/rag.service';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
})
export class ChatComponent {
  input = '';
  messages: { role: 'user' | 'assistant'; text: string; shots?: string[] }[] =
    [];

  loading = false;

  constructor(private rag: RagService) {}

  async send() {
    const q = this.input.trim();
    if (!q) return;
    this.messages.push({ role: 'user', text: q });
    this.input = '';
    this.loading = true;
    try {
      const res = await this.rag.ask(q).toPromise();
      this.messages.push({
        role: 'assistant',
        text: res?.answer || '',
        shots: res?.screenshots || [],
      });
    } finally {
      this.loading = false;
    }
  }
}
