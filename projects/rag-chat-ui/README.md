# RagChat UI

A lightweight **Angular chat component** for Retrieval-Augmented Generation (RAG).  
Drop it into any Angular app and point it at your backend’s `/api/ask` endpoint.

> ✅ No secrets in the UI  
> ✅ Simple API contract (`POST /ask` → `{ answer, screenshots }`)  
> ✅ Works with Angular modules **or** standalone apps

---

## Installation

```bash
npm i rag-chat-ui

Peer requirements

Angular >= 15

@angular/forms

@angular/common

@angular/common/http

Quick Start
Using NgModule (classic)
// app.module.ts
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RagChatUiModule } from 'rag-chat-ui';
import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, HttpClientModule, FormsModule, RagChatUiModule],
  bootstrap: [AppComponent],
})
export class AppModule {}

<!-- app.component.html -->
<ragu-chat [apiBase]="'https://your-backend.example.com/api'"></ragu-chat>

Using Standalone Bootstrap (Angular 15+)
// main.ts
import { bootstrapApplication, importProvidersFrom } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RagChatUiModule } from 'rag-chat-ui';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [importProvidersFrom(HttpClientModule, FormsModule, RagChatUiModule)],
});

Component
<ragu-chat [apiBase]="'/api'"></ragu-chat>

Inputs
Input	Type	Default	Description
apiBase	string	'/api'	Base URL of your backend (must expose /ask).

Backend Contract

Your backend should implement:

POST {apiBase}/ask

Request body

{ "query": "string" }

Response
{ "answer": "markdown or text", "screenshots": ["https://.../img1.png"] }

The component renders answer and shows each screenshot in a gallery row.

Styling

A clean default layout ships with the component.
Wrap it in a container to control width:
<div style="max-width: 720px; margin: 40px auto;">
  <ragu-chat [apiBase]="'/api'"></ragu-chat>
</div>

Example Backend

Minimal Express/TypeScript handler:
app.post('/api/ask', async (req, res) => {
  const q = String(req.body?.query || '');
  res.json({
    answer: `You asked: **${q}**`,
    screenshots: ['/static/screenshots/example.png'],
  });
});

Local Development (for the library)
# build the library
ng build rag-chat-ui

# preview what will be published
cd dist/rag-chat-ui
npm pack
tar -tf *.tgz   # list package contents

Security

Do not put API keys in frontend code.

Keep secrets in your backend (.env) and never publish them.

FAQ

Q: Does this include retrieval or LLM code?
A: No — this package is UI only. Point it at your own /api/ask.

Q: Can I customize the look?
A: Yes — wrap the component, override CSS globally, or fork the styles.

License

MIT ©ameyb - Amprine Solutions Inc.
```
