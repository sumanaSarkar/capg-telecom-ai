import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PaymentConfirmation, PaymentInitiation } from './payment.model';

@Injectable()
export class PaymentService {
  private readonly payments = new Map<string, PaymentInitiation>();

  initiatePayment(
    customerId: string,
    planId: string,
    amount: number,
  ): PaymentInitiation {
    const paymentId = uuidv4();
    const payment: PaymentInitiation = {
      paymentId,
      paymentUrl: `https://pay.example.com/checkout/${paymentId}?customer=${customerId}&plan=${planId}`,
      status: 'pending',
      amount,
    };
    this.payments.set(paymentId, payment);
    return payment;
  }

  confirmPayment(paymentId: string): PaymentConfirmation {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }
    payment.status = 'success';
    this.payments.set(paymentId, payment);
    return { paymentId, status: 'success' };
  }

  getPayment(paymentId: string): PaymentInitiation | undefined {
    return this.payments.get(paymentId);
  }
}
