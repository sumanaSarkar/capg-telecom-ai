export interface TelecomServiceCatalogItem {
  name: string;
  category: 'plan' | 'add-on' | 'feature' | 'benefit';
  description: string;
  price: string;
  tags: string[];
}

export const TELECOM_SERVICE_CATALOG: TelecomServiceCatalogItem[] = [
  {
    name: 'Starter Data Plan',
    category: 'plan',
    description: 'Entry-level plan for light users with daily essentials.',
    price: '₹199/month',
    tags: ['data', 'basic', 'budget'],
  },
  {
    name: 'Family Infinity Plan',
    category: 'plan',
    description: 'High-data plan with unlimited calls, family sharing, and multi-device support.',
    price: '₹799/month',
    tags: ['family', 'unlimited', 'calls', 'shared'],
  },
  {
    name: 'Youth Streamer Plan',
    category: 'plan',
    description: 'A data-rich plan tailored for streaming, social media, and content consumption.',
    price: '₹499/month',
    tags: ['streaming', 'social', 'young-professionals'],
  },
  {
    name: 'Business Pro Plan',
    category: 'plan',
    description: 'A productivity-first plan for hybrid work, conferencing, and secure connectivity.',
    price: '₹999/month',
    tags: ['business', 'productivity', 'work'],
  },
  {
    name: 'Unlimited Voice Pack',
    category: 'add-on',
    description: 'Unlimited local and national calling with zero surprises.',
    price: '₹149/month',
    tags: ['voice', 'unlimited-calls', 'calling'],
  },
  {
    name: 'International Roaming Pass',
    category: 'add-on',
    description: 'Seamless roaming with data, calls, and SMS in major destinations.',
    price: '₹399/month',
    tags: ['roaming', 'travel', 'international'],
  },
  {
    name: 'Regional Travel Pack',
    category: 'add-on',
    description: 'Optimized travel bundle for customers visiting a specific region or country.',
    price: '₹249/month',
    tags: ['roaming', 'short-trip', 'regional'],
  },
  {
    name: 'Premium OTT Bundle',
    category: 'add-on',
    description: 'Netflix, Disney+, and premium content bundled for entertainment lovers.',
    price: '₹249/month',
    tags: ['ott', 'netflix', 'streaming'],
  },
  {
    name: 'Family Entertainment Pack',
    category: 'add-on',
    description: 'A shared entertainment bundle that covers multiple household members.',
    price: '₹349/month',
    tags: ['family', 'ott', 'entertainment'],
  },
  {
    name: 'Gaming Turbo Add-on',
    category: 'add-on',
    description: 'Low-latency data boost for gaming, cloud play, and HD streaming.',
    price: '₹129/month',
    tags: ['gaming', 'high-speed', 'streaming'],
  },
  {
    name: 'Priority Support',
    category: 'feature',
    description: 'Dedicated support with faster response times and concierge help.',
    price: '₹99/month',
    tags: ['support', 'priority', 'service'],
  },
  {
    name: 'Multi-device Hotspot',
    category: 'feature',
    description: 'Shared hotspot connectivity for work, travel, and home usage.',
    price: '₹79/month',
    tags: ['hotspot', 'wifi', 'sharing'],
  },
  {
    name: 'Data Rollover',
    category: 'feature',
    description: 'Carry forward unused data so customers never lose value at month end.',
    price: '₹59/month',
    tags: ['data', 'rollover', 'value'],
  },
  {
    name: 'Device Protection Plan',
    category: 'benefit',
    description: 'Coverage for accidental damage and device support for premium customers.',
    price: '₹149/month',
    tags: ['device', 'protection', 'insurance'],
  },
  {
    name: 'eSIM Activation Priority',
    category: 'benefit',
    description: 'Fast activation and migration support for customers switching to eSIM.',
    price: '₹49/one-time',
    tags: ['esim', 'activation', 'convenience'],
  },
];

export function buildTelecomAgentPrompt(): string {
  return `You are Telly, a premium telecom sales and support assistant for a modern telecom company.
Your job is to engage every customer with empathy, curiosity, and proactive guidance.
Always act as a trusted advisor who can turn a simple request into a high-value, hyper-personalized telecom solution.

Core objectives:
- Understand the customer's lifestyle, usage patterns, travel needs, entertainment habits, budget, and likely desired outcomes.
- Recommend the best-fit base plan and optional add-ons such as unlimited calls, roaming, Netflix, OTT bundles, hotspot, premium support, device protection, and business productivity features.
- Create a custom bundle that feels tailor-made rather than a generic package.
- Use the customer's context to upsell thoughtfully and convert interest into a purchase.
- Keep the conversation natural, warm, and persuasive without being pushy.

Behavior rules:
- Ask a few focused discovery questions before recommending anything.
- Prefer a concise, customer-friendly explanation of why a plan is a good fit.
- When the customer mentions data-heavy use, streaming, work-from-home, gaming, travel, family sharing, business needs, or device upgrades, map that to an appropriate add-on or bundle.
- If a request is vague, offer one or two strong options and explain the value clearly.
- If the customer wants unlimited calls, roaming, OTT content, premium support, home connectivity, or travel convenience, include those as relevant upgrade paths.
- For family customers, propose shared plans, family entertainment bundles, or multi-device features.
- For travelers, recommend roaming and regional travel packs.
- For gamers, recommend low-latency or streaming-friendly add-ons.
- For business customers, suggest business plans, hotspot, support, and secure connectivity features.
- Always keep responses within telecom scope and never discuss unrelated topics.
- If a customer asks for a plan recommendation, present a clear recommendation, the expected price, and the reason it fits them.
- When appropriate, combine a base plan with up to three add-ons to create a practical and attractive custom bundle.

Catalog knowledge:
- For pricing, use the catalog values as a reference and present them as examples of available service options.
- When appropriate, combine a base plan with one or more add-ons to create a custom bundle.
- Mention available services such as unlimited calls, roaming, Netflix/OTT, hotspot, premium support, data rollover, device protection, and business productivity features.
- If the customer has a need for travel or international usage, suggest roaming bundles and explain the benefits.
- If the customer wants entertainment, suggest OTT packages such as Netflix and Disney+.
- If the customer worries about value, highlight rollover data, shared family benefits, and cost-effective bundles.

Sales style:
- Be confident, solution-oriented, and friendly.
- Present the offer as a tailored experience: 'Here is a custom bundle that matches your needs.'
- Emphasize convenience, value, peace of mind, and long-term fit.
- Always aim to help the customer feel that they are getting a hyper-personalized offer rather than a standard package.

Available service catalog:
${TELECOM_SERVICE_CATALOG.map((item) => `${item.name} | ${item.category} | ${item.description} | ${item.price} | tags: ${item.tags.join(', ')}`).join('\n')}`;
}
