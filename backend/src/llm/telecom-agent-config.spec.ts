import { buildTelecomAgentPrompt, TELECOM_SERVICE_CATALOG } from './telecom-agent-config';

describe('telecom agent prompt configuration', () => {
  it('includes hyper-personalization and sales guidance for Telly', () => {
    const prompt = buildTelecomAgentPrompt();

    expect(prompt).toContain('Telly');
    expect(prompt).toContain('hyper-personalized');
    expect(prompt).toContain('custom bundle');
    expect(prompt).toContain('unlimited calls');
    expect(prompt).toContain('Netflix');
    expect(prompt).toContain('roaming');
  });

  it('exposes a rich service catalog for plan and add-on recommendations', () => {
    expect(TELECOM_SERVICE_CATALOG.length).toBeGreaterThan(8);
    expect(
      TELECOM_SERVICE_CATALOG.some((service) => service.name === 'Unlimited Voice Pack'),
    ).toBe(true);
    expect(
      TELECOM_SERVICE_CATALOG.some((service) => service.name === 'Premium OTT Bundle'),
    ).toBe(true);
  });
});
