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

  it('returns customer-specific plans for each demo account', () => {
    expect(service.getPlans('cust-001').map((plan) => plan.id)).toEqual([
      'plan-001',
      'plan-002',
      'plan-003',
    ]);
    expect(service.getPlans('cust-002').map((plan) => plan.id)).toEqual([
      'plan-011',
      'plan-012',
      'plan-013',
    ]);
    expect(service.getPlans('cust-003').map((plan) => plan.id)).toEqual([
      'plan-021',
      'plan-022',
      'plan-023',
    ]);
  });

  it('includes exactly one recommended plan per customer', () => {
    for (const customerId of ['cust-001', 'cust-002', 'cust-003']) {
      const plans = service.getPlans(customerId);
      const recommended = plans.filter((p) => p.recommended);
      expect(recommended).toHaveLength(1);
    }
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
