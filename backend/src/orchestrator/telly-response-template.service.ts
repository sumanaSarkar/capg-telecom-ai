import { Injectable } from '@nestjs/common';
import { CustomerIntelligence } from './customer-intelligence.service';
import { CustomPlan } from './custom-plan-composer.service';

interface TemplateContext {
  message: string;
  customerName: string;
  customPlan: CustomPlan;
  intelligence: CustomerIntelligence;
}

@Injectable()
export class TellyResponseTemplateService {
  buildRecommendationMessage(ctx: TemplateContext): string {
    const { message, customerName, customPlan, intelligence } = ctx;
    const firstName = customerName.split(' ')[0];
    const price = `₹${customPlan.price.toFixed(0)}/mo`;
    const components = customPlan.components
      .map((c) => `**${c.name}** (₹${c.monthlyPrice}/mo)`)
      .join(', ');
    const savingsLine = customPlan.discountNote
      ? `\n🎁 ${customPlan.discountNote}.`
      : '';
    const badge = customPlan.exclusiveBadge ?? 'Personalised for You';

    const tone = this.detectTone(message);
    const opener = this.pickOpener(tone, intelligence, firstName, customPlan);
    const body = this.buildBody(tone, intelligence, customPlan, price, components);
    const close = this.pickClose(tone, intelligence);

    return `${opener}\n\n${body}${savingsLine}\n\n${close}`.trim();
  }

  private detectTone(message: string): string {
    const m = message.toLowerCase();
    if (/decide|manage|behalf|take care|handle|look after|take over/.test(m)) return 'delegate';
    if (/urgent|asap|immediately|right now|quickly|fast|help me now/.test(m)) return 'urgent';
    if (/family|kids|household|everyone|all of us|shared/.test(m)) return 'family';
    if (/travel|trip|going to|visiting|roaming|abroad|europe|usa|international|thailand|dubai|uae|japan|china/.test(m)) return 'travel';
    if (/stream|netflix|hotstar|ott|watch|entertainment|movies/.test(m)) return 'entertainment';
    if (/work|business|office|meeting|remote|productivity/.test(m)) return 'business';
    if (/cheap|affordable|budget|save|discount|less|low cost/.test(m)) return 'budget';
    if (/best|suggest|recommend|what should|advise|guide/.test(m)) return 'advice';
    if (/upgrade|premium|elite|top|best possible|nothing less/.test(m)) return 'premium';
    return 'general';
  }

  private pickOpener(tone: string, intelligence: CustomerIntelligence, firstName: string, customPlan: CustomPlan): string {
    const badge = customPlan.exclusiveBadge ?? 'Personalised for You';
    switch (tone) {
      case 'delegate':
        return `${firstName}, I have taken charge and designed a plan that fits your lifestyle perfectly. Here's what I've put together — the **${customPlan.name}**.`;
      case 'urgent':
        return `I'm on it, ${firstName}. Here's the best plan I can activate for you right now — no delays.`;
      case 'family':
        return `Great news for the whole household, ${firstName}! I've crafted a plan that keeps everyone connected — introducing the **${customPlan.name}**.`;
      case 'travel':
        return `Before your next trip, ${firstName}, let me make sure you're covered. I've put together the **${customPlan.name}** so you stay connected wherever you go.`;
      case 'entertainment':
        return `${firstName}, your entertainment setup just got a major upgrade. I've built the **${customPlan.name}** with everything you love to watch.`;
      case 'business':
        return `${firstName}, I've designed this specifically to keep your work running smoothly — the **${customPlan.name}**, built for professionals.`;
      case 'budget':
        return `${firstName}, I've found a way to give you exactly what you need without stretching your budget. Here's the **${customPlan.name}**, crafted with savings in mind.`;
      case 'advice':
        return `Based on your usage and needs, ${firstName}, I'd recommend the **${customPlan.name}** — and here's why it's the right call for you.`;
      case 'premium':
        return `${firstName}, you asked for the best — so I made sure this plan delivers. The **${customPlan.name}** is your premium, no-compromise option.`;
      default:
        if (intelligence.segment === 'traveler') {
          return `${firstName}, here's a plan tailored for your travel patterns — the **${customPlan.name}**.`;
        }
        return `✨ ${badge} — ${firstName}, I've built the **${customPlan.name}** specifically for you.`;
    }
  }

  private buildBody(tone: string, intelligence: CustomerIntelligence, customPlan: CustomPlan, price: string, components: string): string {
    const valueStatement = this.valueStatement(tone, intelligence, customPlan);
    return `${valueStatement}\n\nThis offer is built for your current **${customPlan.provider}** network, using only our available ${customPlan.provider} plans and packages.\n\nWhat's included at **${price}**: ${components}.`;
  }

  private valueStatement(tone: string, intelligence: CustomerIntelligence, customPlan: CustomPlan): string {
    switch (tone) {
      case 'delegate':
        return `I've matched every component to your actual usage — no guesswork, no overpaying. This is the plan I would choose for you.`;
      case 'urgent':
        return `This plan covers everything you need right away. I've kept it simple, focused, and ready to activate with one tap.`;
      case 'family':
        return `Every member of your household gets covered — calls, data, and entertainment. Shared value, no trade-offs.`;
      case 'travel':
        return `You'll have data, calling, and roaming handled so there are no nasty surprises when you're abroad.`;
      case 'entertainment':
        return `All your favourite streaming services are built right in. Sit back, relax — it's all taken care of.`;
      case 'business':
        return `Reliable data, calling, and connectivity features that match how you work — nothing superfluous, nothing missing.`;
      case 'budget':
        return `I've trimmed everything unnecessary so you get maximum value. Every rupee in this plan is working for you.`;
      case 'advice':
        return `Your current usage tells me this is the right fit. It covers your data peaks, calling habits, and anticipated needs with headroom to grow.`;
      case 'premium':
        return `Premium data, priority calling, and top-tier add-ons — this is the full package with nothing held back.`;
      default:
        if (intelligence.priceSensitivity === 'high') {
          return `This is the most value-packed option I could find for your usage pattern — solid coverage at a price that makes sense.`;
        }
        if (intelligence.segment === 'streamer') {
          return `Built around your data and entertainment habits — everything you use every day is covered in one bundle.`;
        }
        return `I've matched this plan to your real usage so you're not paying for things you don't use.`;
    }
  }

  private pickClose(tone: string, intelligence: CustomerIntelligence): string {
    switch (tone) {
      case 'delegate':
        return `Tap **Yes, activate this plan** and I'll handle the rest. You won't need to lift a finger.`;
      case 'urgent':
        return `Ready when you are — just tap **Yes, activate this plan** and it goes live immediately.`;
      case 'family':
        return `Shall I activate this for everyone? Tap **Yes, activate this plan** to confirm.`;
      case 'travel':
        return `Get sorted before you leave — tap **Yes, activate this plan** to lock it in.`;
      case 'entertainment':
        return `Ready to start streaming? Tap **Yes, activate this plan** and enjoy.`;
      case 'business':
        return `Activate it now so there's no disruption to your work. Tap **Yes, activate this plan**.`;
      case 'budget':
        return `Lock in these savings today — tap **Yes, activate this plan** and you're done.`;
      case 'advice':
        return `I'm confident this is the right plan for you. Shall I activate it? Tap **Yes, activate this plan**.`;
      case 'premium':
        return `This is your premium experience — tap **Yes, activate this plan** to get started right away.`;
      default:
        if (intelligence.priceSensitivity === 'high') {
          return `Want to lock in this deal? Tap **Yes, activate this plan** — or let me know if you'd like to adjust anything.`;
        }
        return `Would you like to activate this plan? Tap **Yes, activate this plan** to proceed.`;
    }
  }
}
