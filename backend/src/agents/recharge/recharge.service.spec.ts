import { RechargeService } from './recharge.service';

describe('RechargeService activation status', () => {
  it('reports a pending activation as not activated until recharge succeeds', () => {
    const service = new RechargeService();

    service.markPendingActivation('cust-001', 'plan-001');

    expect(service.getActivationStatus('cust-001')).toEqual({
      status: 'not_activated',
      paymentPending: true,
      planId: 'plan-001',
      activatedAt: undefined,
    });

    service.applyRecharge('cust-001', 'plan-001');

    expect(service.getActivationStatus('cust-001')).toMatchObject({
      status: 'activated',
      paymentPending: false,
      planId: 'plan-001',
    });
    expect(service.getActivationStatus('cust-001').activatedAt).toBeDefined();
  });

  it('reports an account with no activation as not activated', () => {
    const service = new RechargeService();

    expect(service.getActivationStatus('cust-001')).toEqual({
      status: 'not_activated',
      paymentPending: false,
      planId: undefined,
      activatedAt: undefined,
    });
  });
});
