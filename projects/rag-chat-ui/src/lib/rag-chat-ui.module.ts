import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { RagChatComponent } from './rag-chat/rag-chat.component';

@NgModule({
  declarations: [RagChatComponent],
  imports: [CommonModule, FormsModule, HttpClientModule],
  exports: [RagChatComponent],
})
export class RagChatUiModule {}
