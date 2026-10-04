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

  it('guides vague plan requests through personalized, one-question-at-a-time discovery', () => {
    const prompt = buildTelecomAgentPrompt();

    expect(prompt).toContain('Never jump from a vague request like "I need a plan" straight to a generic offer');
    expect(prompt).toContain('monthly budget, data use, calling, roaming destinations and frequency');
    expect(prompt).toContain('Ask one focused question per turn');
    expect(prompt).toContain('redirect to telecom, and ask one concrete question');
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

  it('requires helpful acknowledgment and a telecom bridge for off-topic requests', () => {
    const prompt = buildTelecomAgentPrompt();

    expect(prompt).toContain('Telecom is the only response domain');
    expect(prompt).toContain('Never hard-reject an off-topic request');
    expect(prompt).toContain('never answer it in its original non-telecom domain');
    expect(prompt).toContain('one relevant telecom option');
    expect(prompt).toContain('generate qualified leads');
    expect(prompt).not.toContain('DO NOT FORCE UNRELATED PITCHES');
  });

  it('keeps destination plan requests within telecom scope', () => {
    const prompt = buildTelecomAgentPrompt();

    expect(prompt).toContain('any destination');
    expect(prompt).toContain('Do not create tour itineraries');
    expect(prompt).toContain('roaming data, international calling, SMS, eSIM');
  });

  it('uses a Maldives telecom sales conversation for travel-plan examples', () => {
    const prompt = buildTelecomAgentPrompt();

    expect(prompt).toContain('I am going to Maldives. Give me a plan for 7 days.');
    expect(prompt).toContain('mobile data, calling, and eSIM options');
    expect(prompt).toContain('browsing and streaming, or more calling time');
  });

  it('includes telecom-only examples for data, network, eSIM, family, and business needs', () => {
    const prompt = buildTelecomAgentPrompt();

    expect(prompt).toContain('I need more data for work and video calls.');
    expect(prompt).toContain('My calls keep dropping.');
    expect(prompt).toContain('I want an eSIM.');
    expect(prompt).toContain('Which plan is best for my family?');
    expect(prompt).toContain('I need a business connection for my office.');
  });
});
