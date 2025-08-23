import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RefMemberComponent } from './ref-member.component';

describe('RefMemberComponent', () => {
  let component: RefMemberComponent;
  let fixture: ComponentFixture<RefMemberComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RefMemberComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RefMemberComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
