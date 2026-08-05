import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let service: ProfileService;

  beforeEach(() => {
    service = new ProfileService();
  });

  it('returns the correct profile shape for a known customer', () => {
    const profile = service.getProfile('cust-001');

    expect(profile).toEqual({
      customerId: 'cust-001',
      name: 'Alex Johnson',
      email: 'alex@example.com',
      phone: '+1-555-0101',
      plan: 'Basic 5GB',
      customerType: 'postpaid',
      kycStatus: 'verified',
      accountBalance: 45.5,
    });
  });

  it('throws NotFoundException for an unknown customer', () => {
    expect(() => service.getProfile('unknown')).toThrow();
  });
});
