import { ConsultativeFlowService } from './consultative-flow.service';

describe('ConsultativeFlowService', () => {
  let flow: ConsultativeFlowService;

  beforeEach(() => {
    flow = new ConsultativeFlowService();
  });

  it('asks the next telecom question for a destination, then builds an offer from spoken answers', () => {
    const first = flow.handle('c1', 'I am going to Dubai.');
    expect(first).toMatchObject({ kind: 'reply', intent: 'TELECOM_ROAMING' });

    const days = flow.handle('c1', 'for five days.');
    expect(days).toMatchObject({ kind: 'reply' });
    expect((days as { message: string }).message).toMatch(/data|calls/i);

    const purpose = flow.handle('c1', 'I think I will need both.');
    expect((purpose as { message: string }).message).toMatch(/how much data/i);

    const offer = flow.handle('c1', 'I use around twenty-five GB.');
    expect(offer).toMatchObject({ kind: 'travel_offer', destination: 'dubai', days: 5, purpose: 'both', dataGB: 25 });
  });

  it('offers immediately when destination, days and need are all given', () => {
    const offer = flow.handle('c2', 'I am going to Japan for 10 days and need data and calls');
    expect(offer).toMatchObject({ kind: 'travel_offer', destination: 'japan', days: 10 });
  });

  it('responds empathetically to a lost phone and proactively moves to block, replacement and offers', () => {
    const opening = flow.handle('c3', 'I lost my phone');
    expect((opening as { message: string }).message).toMatch(/sorry/i);
    expect((opening as { message: string }).message).toMatch(/block/i);

    const blocked = flow.handle('c3', 'yes please');
    expect(blocked).toMatchObject({ kind: 'reply', action: 'block_sim' });
    expect((blocked as { message: string }).message).toMatch(/eSIM/);

    const replacement = flow.handle('c3', 'eSIM please');
    expect((replacement as { message: string }).message).toMatch(/personalised plan/i);

    expect(flow.handle('c3', 'yes build one')).toMatchObject({ kind: 'delegate' });
  });

  it('does not accept an unrecognised destination and asks which country instead', () => {
    const first = flow.handle('c5', 'I am going to Fillify for 3 days') as { message: string };
    expect(first.message).toMatch(/couldn't find "Fillify"/);
    expect(first.message).toMatch(/Which country or city/);

    const fixed = flow.handle('c5', 'I mean Dubai for 3 days') as { message: string };
    expect(fixed.message).toMatch(/Dubai/);
    expect(fixed.message).toMatch(/data/i);
  });

  it('ignores non-travel uses of "going to"', () => {
    expect(flow.handle('c6', 'I am going to buy a new phone')).toBeNull();
  });

  it('uses a short, different clarifier when an answer is not understood', () => {
    flow.handle('c7', 'I am going to Dubai for 3 days');
    const first = (flow.handle('c7', 'bot') as { message: string }).message;
    const second = (flow.handle('c7', 'hmm') as { message: string }).message;

    expect(first).toMatch(/data, for calls, or both/);
    expect(first.length).toBeLessThan(80);
    expect(second).toBe(first);
    expect(flow.handle('c7', 'hmm')).toBeNull();
  });

  it('understands Bengali answers for purpose and data size', () => {
    flow.handle('c8', 'I am going to Dubai for 3 days');
    flow.handle('c8', 'দুটোই');
    const offer = flow.handle('c8', 'লাইট ফাইভ গিগাবাইট');
    expect(offer).toMatchObject({ kind: 'travel_offer', destination: 'dubai', purpose: 'both', dataGB: 5 });
  });

  it('drops the conversation state when the customer switches to a bill request', () => {
    flow.handle('c4', 'I am going to Dubai');
    expect(flow.handle('c4', 'show my last 2 bills')).toBeNull();
    expect(flow.handle('c4', 'for five days')).toBeNull();
  });
});
