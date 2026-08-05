export interface Plan {
  id: string;
  name: string;
  dataGB: number;
  callMinutes: number;
  price: number;
  features: string[];
  recommended: boolean;
}
