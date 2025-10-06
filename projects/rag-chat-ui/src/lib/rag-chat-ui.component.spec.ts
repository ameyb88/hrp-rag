import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RagChatUiComponent } from './rag-chat-ui.component';

describe('RagChatUiComponent', () => {
  let component: RagChatUiComponent;
  let fixture: ComponentFixture<RagChatUiComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RagChatUiComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RagChatUiComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
