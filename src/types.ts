export interface Plan {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  description: string;
}

export interface UserSubscription {
  id: string;
  planId: string;
  planName: string;
  endDate: string;
  joinLink: string;
}

export interface User {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  subscriptionEnd?: string;
  botState?: string;
  stateData?: string;
  subscriptions?: UserSubscription[];
}

export interface Transaction {
  id: string;
  userId: string;
  planId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  date: string;
}

export interface Settings {
  cardNumber: string;
  adminChatId: string;
}

export interface Stats {
  totalUsers: number;
  activeSubscriptions: number;
  totalPlans: number;
}
