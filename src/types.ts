export interface Staff {
  id: number;
  name: string;
}

export interface DailyBudget {
  date: string;
  total_budget: number;
  total_hours: number;
}

export interface SalesEntry {
  staff_id: number;
  name: string;
  shift_hours: number;
  actual_sales: number;
  target_sales: number;
  ips: number;
  avg_sale: number;
  jcp_sales: number;
  is_submitted: number;
}

export interface MonthlySummary {
  staff: {
    staff_id: number;
    name: string;
    total_sales: number;
    total_target: number;
    total_hours: number;
    avg_ips: number;
    avg_sale_val: number;
  }[];
  store: {
    total_budget: number;
    total_hours: number;
  };
  dailyBudgets?: {
    date: string;
    total_budget: number;
    total_hours: number;
  }[];
}
