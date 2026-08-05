import { PlanService } from './plan.service';

describe('PlanService', () => {
  let service: PlanService;

  beforeEach(() => {
    service = new PlanService();
  });

  it('returns an array of plans with the expected fields', () => {
    const plans = service.getPlans('cust-001');

    expect(Array.isArray(plans)).toBe(true);
    expect(plans).toHaveLength(3);

    for (const plan of plans) {
      expect(plan).toHaveProperty('id');
      expect(plan).toHaveProperty('name');
      expect(plan).toHaveProperty('dataGB');
      expect(plan).toHaveProperty('callMinutes');
      expect(plan).toHaveProperty('price');
      expect(plan).toHaveProperty('features');
      expect(plan).toHaveProperty('recommended');
    }
  });

  it('includes exactly one recommended plan', () => {
    const plans = service.getPlans();
    const recommended = plans.filter((p) => p.recommended);
    expect(recommended).toHaveLength(1);
    expect(recommended[0].id).toBe('plan-002');
  });

  it('getPlanById returns the matching plan', () => {
    const plan = service.getPlanById('plan-003');
    expect(plan?.name).toBe('Premium Unlimited');
    expect(plan?.dataGB).toBe(-1);
  });

  it('getPlanById returns undefined for an unknown id', () => {
    expect(service.getPlanById('does-not-exist')).toBeUndefined();
  });
});
