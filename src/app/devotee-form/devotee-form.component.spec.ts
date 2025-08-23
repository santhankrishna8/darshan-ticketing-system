import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DevoteeFormComponent } from './devotee-form.component';

describe('DevoteeFormComponent', () => {
  let component: DevoteeFormComponent;
  let fixture: ComponentFixture<DevoteeFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DevoteeFormComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DevoteeFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
