export interface MockUser {
  id: string;
  username: string;
  password: string;
  customerId: string;
}

export const MOCK_USERS: MockUser[] = [
  {
    id: 'u1',
    username: 'user1',
    password: 'password123',
    customerId: 'cust-001',
  },
  {
    id: 'u2',
    username: 'user2',
    password: 'password123',
    customerId: 'cust-002',
  },
  {
    id: 'u3',
    username: 'user3',
    password: 'password123',
    customerId: 'cust-003',
  },
];
