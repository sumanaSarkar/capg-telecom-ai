export interface PaymentInitiation {
  paymentId: string;
  paymentUrl: string;
  status: 'pending' | 'success' | 'failed';
  amount: number;
}

export interface PaymentConfirmation {
  paymentId: string;
  status: 'pending' | 'success' | 'failed';
}
