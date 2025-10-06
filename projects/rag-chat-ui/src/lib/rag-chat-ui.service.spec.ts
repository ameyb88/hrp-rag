import { TestBed } from '@angular/core/testing';

import { RagChatUiService } from './rag-chat-ui.service';

describe('RagChatUiService', () => {
  let service: RagChatUiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RagChatUiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
