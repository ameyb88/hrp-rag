import { Component } from '@angular/core';
import { RagService } from '../services/rag.service';
import { marked } from 'marked';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
})
export class ChatComponent {
  input = '';
  messages: {
    role: 'user' | 'assistant';
    text: string;
    html?: string;
    shots?: string[];
  }[] = [];
  loading = false;
  private DOMPurify: any;
  mobileMenuOpen = false;

  constructor(private rag: RagService) {
    // Configure marked for better rendering
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    // Load DOMPurify dynamically
    this.loadDOMPurify();
  }

  async loadDOMPurify() {
    const module: any = await import('dompurify');
    this.DOMPurify = module.default || module;
  }

  async send() {
    const q = this.input.trim();
    if (!q) return;

    this.messages.push({ role: 'user', text: q });
    this.input = '';
    this.loading = true;

    try {
      const res = await this.rag.ask(q).toPromise();
      const rawText = res?.answer || '';

      // Convert markdown to HTML and sanitize
      const htmlContent = marked.parse(rawText) as string;

      // Wait for DOMPurify to load if not ready
      if (!this.DOMPurify) {
        await this.loadDOMPurify();
      }

      const sanitizedHtml = this.DOMPurify.sanitize(htmlContent);

      this.messages.push({
        role: 'assistant',
        text: rawText,
        html: sanitizedHtml,
        shots: res?.screenshots || [],
      });
      setTimeout(() => this.scrollToBottom(), 100);
    } finally {
      this.loading = false;
    }
  }

  askQuestion(question: string) {
    this.input = question;
    this.send();
  }

  private scrollToBottom() {
    const messagesContainer = document.querySelector('.chat-messages');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  askQuestionAndClose(question: string) {
    this.askQuestion(question);
    this.mobileMenuOpen = false;
  }
}
