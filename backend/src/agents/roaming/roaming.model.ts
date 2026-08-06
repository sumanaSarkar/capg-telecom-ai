export interface RoamingStatus {
  customerId: string;
  enabled: boolean;
  activatedAt?: string;
  countriesCovered: string[];
}

export interface RoamingPackage {
  id: string;
  name: string;
  countries: string[];
  dataGB: number;
  days: number;
  price: number;
  recommended: boolean;
}
