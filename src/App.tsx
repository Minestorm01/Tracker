import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  ReceiptText, 
  Settings, 
  TrendingUp, 
  Calendar, 
  Upload, 
  Clock, 
  DollarSign, 
  Save, 
  AlertCircle, 
  FileUp,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Users,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameMonth, startOfWeek, endOfWeek, isSameDay, addDays } from 'date-fns';
import { Staff, DailyBudget, SalesEntry, MonthlySummary } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sales' | 'monthly' | 'upload' | 'staff'>('dashboard');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [budget, setBudget] = useState<DailyBudget>({ date: selectedDate, total_budget: 0, total_hours: 0 });
  const [salesEntries, setSalesEntries] = useState<SalesEntry[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
  const [monthlyDetails, setMonthlyDetails] = useState<any[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawSalesText, setRawSalesText] = useState('');
  const [showRawInput, setShowRawInput] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');

  const fetchStaff = async () => {
    const res = await fetch('/api/staff');
    const data = await res.json();
    setStaffList(data);
  };

  const handleAddStaff = async () => {
    if (!newStaffName.trim()) return;
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newStaffName })
      });
      if (res.ok) {
        setNewStaffName('');
        fetchStaff();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to add staff");
      }
    } catch (error) {
      console.error("Error adding staff:", error);
    }
  };

  const handleDeleteStaff = async (id: number) => {
    if (!confirm("Are you sure you want to remove this staff member?")) return;
    try {
      const res = await fetch(`/api/staff/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchStaff();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to delete staff");
      }
    } catch (error) {
      console.error("Error deleting staff:", error);
    }
  };

  const fetchData = async (date: string) => {
    setLoading(true);
    try {
      const [budgetRes, salesRes, staffRes] = await Promise.all([
        fetch(`/api/budget/${date}`),
        fetch(`/api/sales/${date}`),
        fetch('/api/staff')
      ]);
      const budgetData = await budgetRes.json();
      let salesData = await salesRes.json();
      const staffData = await staffRes.json();
      
      if (budgetData.error || salesData.error || staffData.error) {
        console.error("Server error fetching data:", budgetData.error || salesData.error || staffData.error);
        return;
      }

      if (!Array.isArray(salesData)) {
        console.error("Expected salesData to be an array, got:", salesData);
        return;
      }

      if (!Array.isArray(staffData)) {
        console.error("Expected staffData to be an array, got:", staffData);
        return;
      }
      
      // Calculate targets if not set (using Daily Budget / Total Rostered Hours)
      const hourlyTarget = (budgetData.total_budget > 0 && budgetData.total_hours > 0) 
        ? budgetData.total_budget / budgetData.total_hours 
        : 0;

      salesData = salesData.map((entry: any) => ({
        ...entry,
        target_sales: entry.target_sales > 0 ? entry.target_sales : Math.round(entry.shift_hours * hourlyTarget)
      }));

      setBudget(budgetData);
      setSalesEntries(salesData);
      setStaffList(staffData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchMonthlyData = async (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    try {
      const [summaryRes, detailsRes] = await Promise.all([
        fetch(`/api/monthly-summary/${year}/${month}`),
        fetch(`/api/monthly-details/${year}/${month}`)
      ]);
      const summaryData = await summaryRes.json();
      const detailsData = await detailsRes.json();
      
      if (summaryData.error || detailsData.error) {
        console.error("Server error fetching monthly data:", summaryData.error || detailsData.error);
        return;
      }

      if (!Array.isArray(detailsData)) {
        console.error("Expected detailsData to be an array, got:", detailsData);
        return;
      }
      
      // Calculate targets for monthly details if not set
      const enrichedDetails = detailsData.map((entry: any) => {
        // Find store budget for this specific day
        const dayBudget = summaryData.dailyBudgets?.find((b: any) => b.date === entry.date);
        
        // If store budget exists, calculate hourly target
        if (dayBudget && dayBudget.total_budget > 0) {
          // Use total_hours from store budget, or sum shifts from detailsData for this day if store hours is 0
          let totalHours = dayBudget.total_hours;
          if (totalHours === 0) {
            totalHours = detailsData
              .filter((d: any) => d.date === entry.date)
              .reduce((sum: number, d: any) => sum + (d.shift_hours || 0), 0);
          }

          if (totalHours > 0) {
            const hourlyTarget = dayBudget.total_budget / totalHours;
            return {
              ...entry,
              target_sales: entry.target_sales > 0 ? entry.target_sales : Math.round(entry.shift_hours * hourlyTarget)
            };
          }
        }
        return entry;
      });

      setMonthlySummary(summaryData);
      setMonthlyDetails(enrichedDetails);
      
      // If we have a selected staff member, make sure they still exist in the summary
      if (selectedStaffId && !summaryData.staff.some((s: any) => s.staff_id === selectedStaffId)) {
        setSelectedStaffId(null);
      }
    } catch (error) {
      console.error("Error fetching monthly data:", error);
    }
  };

  useEffect(() => {
    fetchData(selectedDate);
    // Replace hyphens with slashes to ensure parsing in local time, not UTC
    const date = new Date(selectedDate.replace(/-/g, '/'));
    if (isNaN(date.getTime())) return; // Don't proceed with invalid dates

    if (date.getMonth() !== currentMonth.getMonth() || date.getFullYear() !== currentMonth.getFullYear()) {
      setCurrentMonth(date);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchMonthlyData(currentMonth);
  }, [currentMonth]);

  const handleSaveSale = async (entry: SalesEntry) => {
    if (!entry.shift_hours || !entry.actual_sales) return;
    
    const targetSales = budget.total_hours > 0 
      ? (budget.total_budget / budget.total_hours) * entry.shift_hours 
      : 0;

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: entry.staff_id,
          date: selectedDate,
          shift_hours: entry.shift_hours,
          actual_sales: entry.actual_sales,
          target_sales: targetSales,
          ips: entry.ips,
          avg_sale: entry.avg_sale,
          jcp_sales: entry.jcp_sales
        })
      });
      if (res.ok) fetchData(selectedDate);
    } catch (error) {
      console.error("Error saving sale:", error);
    }
  };

  const handleRawSalesImport = async () => {
    if (!rawSalesText.trim()) return;

    const lines = rawSalesText.split('\n');
    const dateMatch = rawSalesText.match(/\d{2}\/\d{2}\/\d{4}/);
    let targetDate = selectedDate;

    if (dateMatch) {
      const parts = dateMatch[0].split('/');
      targetDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      setSelectedDate(targetDate);
    }

    const importedEntries = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;

      const nameIndex = parts[0].match(/\d+/) ? 1 : 0;
      const firstName = parts[nameIndex];
      const ips = parseFloat(parts[nameIndex + 5]);
      const avgSale = parseFloat(parts[nameIndex + 8]);
      const jcpSales = parseFloat(parts[nameIndex + 11]);

      if (!isNaN(ips) && !isNaN(avgSale) && !isNaN(jcpSales)) {
        // Find staff by first name
        const staff = staffList.find(s => s.name.toLowerCase().includes(firstName.toLowerCase()));
        if (staff) {
          // Find existing entry to get shift hours
          const existingEntry = salesEntries.find(e => e.staff_id === staff.id);
          const shiftHours = existingEntry?.shift_hours || 0;
          const actualSales = jcpSales; // Based on the script, jcpSales seems to be the actual sales value used for budget calc? 
          // Actually, the script says jcpSales is parseFloat(parts[nameIndex + 11]).
          // Let's assume jcpSales is the actual sales for now.
          
          const targetSales = budget.total_hours > 0 
            ? (budget.total_budget / budget.total_hours) * shiftHours 
            : 0;

          importedEntries.push({
            staff_id: staff.id,
            date: targetDate,
            shift_hours: shiftHours,
            actual_sales: actualSales,
            target_sales: targetSales,
            ips: ips,
            avg_sale: avgSale,
            jcp_sales: jcpSales
          });
        }
      }
    }

    if (importedEntries.length > 0) {
      try {
        await Promise.all(importedEntries.map(entry => 
          fetch('/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
          })
        ));
        fetchData(targetDate);
        setRawSalesText('');
        setShowRawInput(false);
      } catch (error) {
        console.error("Error importing raw sales:", error);
      }
    }
  };

  const totalActualSales = salesEntries.reduce((sum, entry) => sum + (entry.actual_sales || 0), 0);
  const progressPercentage = budget.total_budget > 0 ? (totalActualSales / budget.total_budget) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Sidebar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 md:top-0 md:left-0 md:w-64 md:h-full md:border-r md:border-t-0 z-50 shadow-sm">
        <div className="flex md:flex-col h-full items-center justify-around md:justify-start md:p-6 md:gap-4">
          <div className="hidden md:flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center shadow-lg shadow-brand/20">
              <TrendingUp className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">KPI Tracker</h1>
          </div>
          
          <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard />} label="Daily" />
          <NavButton active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} icon={<ReceiptText />} label="Input" />
          <NavButton active={activeTab === 'monthly'} onClick={() => setActiveTab('monthly')} icon={<Calendar />} label="Monthly" />
          <NavButton active={activeTab === 'staff'} onClick={() => setActiveTab('staff')} icon={<Users />} label="Staff" />
          <NavButton active={activeTab === 'upload'} onClick={() => setActiveTab('upload')} icon={<Upload />} label="Upload" />

          <div className="hidden md:block mt-auto w-full">
            <div className="p-4 bg-brand-light/50 border border-brand/10 rounded-2xl">
              <div className="flex justify-between items-center mb-2">
                <p className="text-[10px] text-brand font-bold uppercase tracking-widest">Active Date</p>
                <button 
                  onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                  className="text-[10px] font-bold text-brand hover:underline"
                >
                  Today
                </button>
              </div>
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-slate-900 font-bold w-full focus:outline-none cursor-pointer text-sm"
              />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pb-24 md:pb-8 md:pl-72 p-4 md:p-8 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h2 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Daily Overview</h2>
                  <h1 className="text-3xl font-black text-slate-900">{format(new Date(selectedDate), 'MMMM do, yyyy')}</h1>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-2 bg-white rounded-3xl p-8 border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="flex justify-between items-end mb-6">
                    <div>
                      <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Store Progress</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-slate-900">${(totalActualSales || 0).toLocaleString()}</span>
                        <span className="text-slate-400 text-lg">/ ${(budget.total_budget || 0).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-black text-brand">{progressPercentage.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(progressPercentage, 100)}%` }}
                      className="h-full bg-brand shadow-[0_0_10px_rgba(37,99,235,0.2)]"
                    />
                  </div>
                </div>

                <div className="bg-brand rounded-3xl p-8 text-white shadow-xl shadow-brand/20 flex flex-col justify-between">
                  <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Store Efficiency</p>
                  <div>
                    <span className="text-4xl font-black">
                      {budget.total_hours > 0 ? `$${(totalActualSales / budget.total_hours).toFixed(2)}` : '$0'}
                    </span>
                    <p className="text-white/60 text-xs mt-1">Sales per labor hour</p>
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between">
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Monthly Target</p>
                  <div>
                    <span className="text-4xl font-black text-slate-900">
                      ${(monthlySummary?.store.total_budget || 0).toLocaleString()}
                    </span>
                    <p className="text-slate-400 text-xs mt-1">Total for {format(currentMonth, 'MMMM')}</p>
                  </div>
                </div>
              </div>

              <section>
                <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Users className="w-5 h-5 text-brand" /> Staff Performance
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {salesEntries.map((entry) => (
                    <EmployeeCard key={entry.staff_id} entry={entry} />
                  ))}
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'sales' && (
            <motion.div key="sales" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-3xl font-black text-slate-900">Sales Input</h2>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowRawInput(!showRawInput)}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-brand hover:bg-brand-light/20 transition-colors"
                  >
                    {showRawInput ? 'Hide Raw Input' : 'Raw Text Import'}
                  </button>
                  <div className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600">
                    {format(new Date(selectedDate.replace(/-/g, '/')), 'MMM dd')}
                  </div>
                </div>
              </div>

              {showRawInput && (
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Paste Sales Report Text Here</p>
                  <textarea 
                    value={rawSalesText}
                    onChange={(e) => setRawSalesText(e.target.value)}
                    placeholder="Paste the raw sales report text here..."
                    className="w-full h-48 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-mono focus:border-brand focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button 
                      onClick={handleRawSalesImport}
                      className="px-6 py-3 bg-brand text-white rounded-xl font-bold shadow-lg shadow-brand/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      Process & Import
                    </button>
                  </div>
                </div>
              )}
              
              <div className="space-y-3">
                {salesEntries.map((entry) => (
                  <SalesInputRow 
                    key={entry.staff_id} 
                    entry={entry} 
                    onSave={handleSaveSale}
                    budgetReady={budget.total_budget > 0 && budget.total_hours > 0}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'monthly' && (
            <motion.div key="monthly" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
              <header className="flex items-center justify-between">
                <div>
                  <h2 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Monthly Performance Sheet</h2>
                  <h1 className="text-3xl font-black text-slate-900">{format(currentMonth, 'MMMM yyyy')}</h1>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </header>

              {monthlySummary && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <SummaryCard label="Total Monthly Sales" value={`$${(monthlySummary.store.total_budget || 0).toLocaleString()}`} icon={<DollarSign />} color="brand" />
                    <SummaryCard label="Total Labor Hours" value={`${(monthlySummary.store.total_hours || 0).toLocaleString()}h`} icon={<Clock />} color="slate" />
                    <SummaryCard label="Store SPH" value={`$${((monthlySummary.store.total_budget || 0) / (monthlySummary.store.total_hours || 1)).toFixed(2)}`} icon={<TrendingUp />} color="emerald" />
                  </div>

                  {/* Monthly Grid View */}
                  {!selectedStaffId ? (
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[1000px]">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest sticky left-0 bg-slate-50 z-10 border-r border-slate-200">Employee</th>
                              {eachDayOfInterval({
                                start: startOfMonth(currentMonth),
                                end: endOfMonth(currentMonth)
                              }).map(day => (
                                <th key={day.toString()} className="p-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center border-r border-slate-200 min-w-[60px]">
                                  {format(day, 'd')}<br/>{format(day, 'EEE')}
                                </th>
                              ))}
                              <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right bg-slate-50 sticky right-0 z-10 border-l border-slate-200">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {monthlySummary.staff.map((s, i) => (
                              <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => setSelectedStaffId(s.staff_id)}>
                                <td className="p-4 font-bold text-slate-900 sticky left-0 bg-white z-10 border-r border-slate-200 hover:text-brand transition-colors">{s.name}</td>
                                {eachDayOfInterval({
                                  start: startOfMonth(currentMonth),
                                  end: endOfMonth(currentMonth)
                                }).map(day => {
                                  const dateStr = format(day, 'yyyy-MM-dd');
                                  const entry = monthlyDetails.find(d => d.staff_id === s.staff_id && d.date === dateStr);
                                  return (
                                    <td key={day.toString()} className="p-2 text-center border-r border-slate-100 text-[10px]">
                                      {entry ? (
                                        <div className="flex flex-col">
                                          <span className="font-bold text-emerald-600">${(entry.actual_sales || 0).toLocaleString()}</span>
                                          <span className="text-slate-300">${(entry.target_sales || 0).toLocaleString()}</span>
                                        </div>
                                      ) : (
                                        <span className="text-slate-200">-</span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="p-4 text-right font-black text-brand sticky right-0 bg-white z-10 border-l border-slate-200">
                                  ${(s.total_sales || 0).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                            {/* Daily Budget Row */}
                            <tr className="bg-brand-light/20 border-t border-brand/10">
                              <td className="p-4 font-black text-brand sticky left-0 bg-brand-light/20 z-10 border-r border-brand/10">Daily Budget</td>
                              {eachDayOfInterval({
                                start: startOfMonth(currentMonth),
                                end: endOfMonth(currentMonth)
                              }).map(day => {
                                const dateStr = format(day, 'yyyy-MM-dd');
                                const budgetEntry = monthlySummary.dailyBudgets?.find(b => b.date === dateStr);
                                return (
                                  <td key={day.toString()} className="p-2 text-center border-r border-brand/10 text-[10px] font-bold text-brand">
                                    {budgetEntry ? `$${budgetEntry.total_budget.toLocaleString()}` : '-'}
                                  </td>
                                );
                              })}
                              <td className="p-4 text-right font-black text-brand sticky right-0 bg-brand-light/20 z-10 border-l border-brand/10">
                                ${(monthlySummary.store.total_budget || 0).toLocaleString()}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <IndividualTracker 
                      staffId={selectedStaffId} 
                      month={currentMonth} 
                      details={monthlyDetails.filter(d => d.staff_id === selectedStaffId)}
                      summary={monthlySummary.staff.find(s => s.staff_id === selectedStaffId)}
                      onBack={() => setSelectedStaffId(null)}
                    />
                  )}

                  {/* Detailed Staff List */}
                  <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-200 bg-slate-50">
                      <h3 className="font-black text-slate-900">Staff Performance Summary</h3>
                    </div>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-200">
                          <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                          <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Hours</th>
                          <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Sales</th>
                          <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Target</th>
                          <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">IPS</th>
                          <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Avg Sale</th>
                          <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Performance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlySummary.staff.map((s, i) => (
                          <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                            <td className="p-6 font-bold text-slate-900">{s.name}</td>
                            <td className="p-6 text-right text-slate-600">{(s.total_hours || 0)}h</td>
                            <td className="p-6 text-right font-bold text-emerald-600">${(s.total_sales || 0).toLocaleString()}</td>
                            <td className="p-6 text-right text-slate-400">${(s.total_target || 0).toLocaleString()}</td>
                            <td className="p-6 text-right font-bold text-slate-600">{(s.avg_ips || 0).toFixed(2)}</td>
                            <td className="p-6 text-right font-bold text-slate-600">${(s.avg_sale_val || 0).toFixed(0)}</td>
                            <td className="p-6 text-right">
                              <span className={`font-black ${s.total_sales >= s.total_target ? 'text-emerald-600' : 'text-brand'}`}>
                                {((s.total_sales / (s.total_target || 1)) * 100).toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'staff' && (
            <motion.div key="staff" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-2xl mx-auto space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-black text-slate-900">Staff Management</h2>
              </div>

              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-900 mb-4">Add New Staff Member</h3>
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    placeholder="Enter full name..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-brand focus:outline-none"
                  />
                  <button 
                    onClick={handleAddStaff}
                    className="px-6 py-3 bg-brand text-white rounded-xl font-bold shadow-lg shadow-brand/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    Add Staff
                  </button>
                </div>
              </div>
              
              <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-900">Active Staff Members</h3>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{staffList.length} Total</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {staffList.map((staff) => (
                    <div key={staff.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-brand-light rounded-full flex items-center justify-center text-brand font-black">
                          {staff.name.charAt(0)}
                        </div>
                        <span className="font-bold text-slate-900">{staff.name}</span>
                      </div>
                      <button 
                        onClick={() => handleDeleteStaff(staff.id)}
                        className="p-2 text-slate-300 hover:text-brand transition-colors"
                        title="Remove Staff"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'upload' && (
            <motion.div key="upload" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-4xl mx-auto space-y-8">
              <h2 className="text-3xl font-black text-slate-900">Data Management</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <UploadSection 
                  title="Upload Monthly Budgets" 
                  description="CSV format: date (YYYY-MM-DD), total_budget, total_hours"
                  endpoint="/api/bulk-budget"
                  onSuccess={() => fetchMonthlyData(currentMonth)}
                  type="budget"
                  onDateJump={setSelectedDate}
                />
                <UploadSection 
                  title="Upload Staff Rosters" 
                  description="CSV format: staff_name, date (YYYY-MM-DD), shift_hours (Supports Dayforce Matrix)"
                  endpoint="/api/bulk-roster"
                  onSuccess={() => fetchData(selectedDate)}
                  type="roster"
                  onDateJump={setSelectedDate}
                />
              </div>

              <div className="bg-brand-light/30 border border-brand/20 rounded-3xl p-8 flex gap-6 items-start">
                <div className="w-12 h-12 bg-brand rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-brand/20">
                  <AlertCircle className="text-white w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-brand-dark mb-2">Automated KPI Tracking</h4>
                  <p className="text-brand-dark/70 leading-relaxed">
                    Uploading rosters and budgets will automatically pre-fill the daily sales input screens. 
                    Targets are calculated instantly based on the rostered shift length and the daily store budget.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col md:flex-row items-center gap-2 md:gap-4 w-full md:px-4 md:py-3 rounded-2xl transition-all ${
        active 
          ? 'text-brand md:bg-brand-light md:border md:border-brand/20' 
          : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      <span className="w-6 h-6">{icon}</span>
      <span className="text-[10px] md:text-sm font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}

const EmployeeCard: React.FC<{ entry: SalesEntry }> = ({ entry }) => {
  const performance = entry.target_sales > 0 ? (entry.actual_sales / entry.target_sales) * 100 : 0;
  const isAboveTarget = performance >= 100;

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all group">
      <div className="flex justify-between items-start mb-4">
        <h4 className="font-black text-slate-900 group-hover:text-brand transition-colors">{entry.name}</h4>
        <div className={`text-[10px] px-2 py-1 rounded-lg font-black uppercase ${
          isAboveTarget ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-light text-brand'
        }`}>
          {performance.toFixed(0)}%
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Actual</p>
            <p className="text-xl font-black text-emerald-600">${(entry.actual_sales || 0).toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Target</p>
            <p className="text-sm font-bold text-slate-400">${(entry.target_sales || 0).toLocaleString()}</p>
          </div>
        </div>
        
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(performance, 100)}%` }}
            className={`h-full ${isAboveTarget ? 'bg-emerald-500' : 'bg-brand'}`}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-50">
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">IPS</p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">{(entry.ips || 0).toFixed(2)}</span>
              <span className={`text-[10px] font-bold ${entry.ips >= 1.45 ? 'text-emerald-500' : 'text-brand'}`}>
                Goal 1.45
              </span>
            </div>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Sale</p>
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm font-bold text-slate-900">${(entry.avg_sale || 0).toFixed(0)}</span>
              <span className={`text-[10px] font-bold ${entry.avg_sale >= 145 ? 'text-emerald-500' : 'text-brand'}`}>
                Goal $145
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SalesInputRow: React.FC<{ entry: SalesEntry, onSave: (e: SalesEntry) => void, budgetReady: boolean }> = ({ entry, onSave, budgetReady }) => {
  const [hours, setHours] = useState(entry.shift_hours?.toString() || '');
  const [sales, setSales] = useState(entry.actual_sales?.toString() || '');
  const [ips, setIps] = useState(entry.ips?.toString() || '');
  const [avgSale, setAvgSale] = useState(entry.avg_sale?.toString() || '');
  const [jcpSales, setJcpSales] = useState(entry.jcp_sales?.toString() || '');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setHours(entry.shift_hours?.toString() || '');
    setSales(entry.actual_sales?.toString() || '');
    setIps(entry.ips?.toString() || '');
    setAvgSale(entry.avg_sale?.toString() || '');
    setJcpSales(entry.jcp_sales?.toString() || '');
  }, [entry]);

  const handleSave = () => {
    onSave({
      ...entry,
      shift_hours: Number(hours),
      actual_sales: Number(sales),
      ips: Number(ips),
      avg_sale: Number(avgSale),
      jcp_sales: Number(jcpSales)
    });
    setIsEditing(false);
  };

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 flex flex-col md:flex-row md:items-center gap-6 shadow-sm">
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <h4 className="font-black text-slate-900 text-lg">{entry.name}</h4>
          {entry.is_submitted === 1 && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
        </div>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
          {entry.shift_hours > 0 ? `${entry.shift_hours} hrs rostered` : 'No rostered hours'}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-center">
        <div className="relative">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Hours</label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="number" 
              step="0.5"
              value={hours}
              onChange={(e) => { setHours(e.target.value); setIsEditing(true); }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-3 text-sm font-bold focus:border-brand focus:outline-none transition-colors"
            />
          </div>
        </div>
        <div className="relative">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Sales</label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="number" 
              value={sales}
              onChange={(e) => { setSales(e.target.value); setIsEditing(true); }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-3 text-sm font-bold focus:border-brand focus:outline-none transition-colors"
            />
          </div>
        </div>
        <div className="relative">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">IPS</label>
          <input 
            type="number" 
            step="0.01"
            value={ips}
            onChange={(e) => { setIps(e.target.value); setIsEditing(true); }}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold focus:border-brand focus:outline-none transition-colors"
          />
        </div>
        <div className="relative">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Avg Sale</label>
          <input 
            type="number" 
            value={avgSale}
            onChange={(e) => { setAvgSale(e.target.value); setIsEditing(true); }}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold focus:border-brand focus:outline-none transition-colors"
          />
        </div>
        <div className="flex items-end h-full pt-5">
          <button 
            onClick={handleSave}
            disabled={!isEditing || !budgetReady}
            className={`w-full p-2 rounded-xl transition-all flex items-center justify-center ${
              isEditing && budgetReady 
                ? 'bg-brand text-white shadow-lg shadow-brand/20' 
                : 'bg-slate-100 text-slate-300'
            }`}
          >
            <Save className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

function IndividualTracker({ staffId, month, details, summary, onBack }: { staffId: number, month: Date, details: any[], summary: any, onBack: () => void }) {
  const days = eachDayOfInterval({
    start: startOfMonth(month),
    end: endOfMonth(month)
  });

  // Group days into weeks (Mon-Sun)
  const weeks: Date[][] = [];
  let currentWeek: Date[] = [];
  
  days.forEach((day, i) => {
    currentWeek.push(day);
    // If Sunday or last day of month
    if (format(day, 'EEE') === 'Sun' || i === days.length - 1) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h3 className="text-xl font-black text-slate-900">Individual Performance Tracker</h3>
      </div>

      {/* Header Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#94ce53] rounded-3xl p-8 text-white shadow-xl shadow-emerald-200">
          <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-2">Staff Member</p>
          <h4 className="text-4xl font-black tracking-tighter">{summary?.name}</h4>
        </div>
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Active Month</p>
          <h4 className="text-4xl font-black tracking-tighter text-slate-900">{format(month, 'MMMM yyyy')}</h4>
        </div>
        <div className="bg-brand rounded-3xl p-8 text-white shadow-xl shadow-brand/20">
          <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-2">Monthly Target</p>
          <h4 className="text-4xl font-black tracking-tighter">${(summary?.total_target || 0).toLocaleString()}</h4>
        </div>
      </div>

      {/* Weekly Blocks */}
      <div className="space-y-12">
        {weeks.map((weekDays, weekIdx) => {
          let runningActual = 0;
          let runningTarget = 0;
          let runningVariance = 0;
          
          // Calculate running totals from previous weeks
          weeks.slice(0, weekIdx).forEach(prevWeek => {
            prevWeek.forEach(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const entry = details.find(d => d.date === dateStr);
              if (entry) {
                runningActual += entry.actual_sales || 0;
                runningTarget += entry.target_sales || 0;
                runningVariance += (entry.actual_sales || 0) - (entry.target_sales || 0);
              }
            });
          });

          return (
            <div key={weekIdx} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-[#94ce53] p-6 text-white flex justify-between items-center">
                <h5 className="text-2xl font-black uppercase tracking-tight">Week {weekIdx + 1}</h5>
                <div className="flex gap-8 text-sm font-bold opacity-90">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase tracking-widest opacity-70">Week Actual</span>
                    <span>${weekDays.reduce((sum, day) => sum + (details.find(d => d.date === format(day, 'yyyy-MM-dd'))?.actual_sales || 0), 0).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase tracking-widest opacity-70">Week Target</span>
                    <span>${weekDays.reduce((sum, day) => sum + (details.find(d => d.date === format(day, 'yyyy-MM-dd'))?.target_sales || 0), 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-24">Day</th>
                      <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Daily Budget</th>
                      <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Actual Sales</th>
                      <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">+/- Variance</th>
                      <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Act Prog</th>
                      <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Bud Prog</th>
                      <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">I.P.S</th>
                      <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">AVG $</th>
                      <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">JCP Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weekDays.map((day, dayIdx) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const entry = details.find(d => d.date === dateStr);
                      const actual = entry?.actual_sales || 0;
                      const target = entry?.target_sales || 0;
                      const variance = actual - target;
                      
                      runningActual += actual;
                      runningTarget += target;
                      runningVariance += variance;

                      return (
                        <tr key={dayIdx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                          <td className="p-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900">{format(day, 'EEE')}</span>
                              <span className="text-[10px] text-slate-400">{format(day, 'do')}</span>
                            </div>
                          </td>
                          <td className="p-4 text-center font-bold text-slate-600">${target.toLocaleString()}</td>
                          <td className="p-4 text-center font-black text-emerald-600">${actual.toLocaleString()}</td>
                          <td className={`p-4 text-center font-bold ${runningVariance >= 0 ? 'text-emerald-600' : 'text-brand'}`}>
                            {runningVariance >= 0 ? '+' : ''}${runningVariance.toLocaleString()}
                          </td>
                          <td className="p-4 text-center font-bold text-slate-900">${runningActual.toLocaleString()}</td>
                          <td className="p-4 text-center font-bold text-slate-400">${runningTarget.toLocaleString()}</td>
                          <td className="p-4 text-center font-bold text-slate-600">{entry?.ips?.toFixed(2) || '-'}</td>
                          <td className="p-4 text-center font-bold text-slate-600">{entry?.avg_sale ? `$${entry.avg_sale.toFixed(0)}` : '-'}</td>
                          <td className="p-4 text-center font-bold text-slate-600">{entry?.jcp_sales || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* Monthly Quote */}
      <div className="bg-[#e6f3df] rounded-[3rem] p-12 text-center space-y-6 border border-emerald-100 shadow-sm">
        <p className="text-2xl font-bold text-slate-800 leading-relaxed max-w-4xl mx-auto">
          Did you reach your sales target, your IPS goal and your AV $ goal this month?
        </p>
        <p className="text-xl italic text-slate-600">
          If you answered no to any of these questions, what are you going to do differently next month to achieve your goals?
        </p>
        <div className="pt-4">
          <span className="text-3xl font-black text-[#ea4335] uppercase tracking-tighter">
            “To change results, you need to change behaviours.” JCP
          </span>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, color }: { label: string, value: string, icon: React.ReactNode, color: string }) {
  const colorClasses: any = {
    brand: 'bg-brand text-white shadow-brand/20',
    slate: 'bg-white text-slate-900 border border-slate-200',
    emerald: 'bg-emerald-600 text-white shadow-emerald-200'
  };

  return (
    <div className={`rounded-3xl p-8 shadow-xl ${colorClasses[color]}`}>
      <div className="flex items-center gap-3 mb-4 opacity-70">
        <span className="w-5 h-5">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
      </div>
      <span className="text-4xl font-black tracking-tighter">{value}</span>
    </div>
  );
}

function UploadSection({ title, description, endpoint, onSuccess, type, onDateJump }: { title: string, description: string, endpoint: string, onSuccess: () => void, type: 'budget' | 'roster', onDateJump?: (date: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const parseDayforceRoster = (sheets: any[][][]) => {
    const allRosterEntries: any[] = [];

    for (const data of sheets) {
      // Find the header row (starts with "Employee" or "Name")
      const headerRowIndex = data.findIndex(row => row && (row[0]?.toString().trim().toLowerCase() === 'employee' || row[0]?.toString().trim().toLowerCase() === 'name'));
      if (headerRowIndex === -1) continue; // Skip sheet if no header found

      const header = data[headerRowIndex];
      
      // Process rows after the header
      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        const staffName = row[0]?.toString().trim();
        if (!staffName || staffName === '' || staffName.toLowerCase() === 'employee' || staffName.toLowerCase() === 'name') continue;

        // Process each date column
        for (let j = 1; j < header.length; j++) {
          const dateStr = header[j]?.toString().trim();
          const cellContent = row[j];

          if (!dateStr || !cellContent) continue;

          // Parse date (DD/MM/YYYY or MM/DD/YYYY or YYYY-MM-DD)
          const dateParts = dateStr.split(/[-/]/);
          if (dateParts.length !== 3) continue;
          
          let formattedDate;
          const p1 = dateParts[0];
          const p2 = dateParts[1];
          const p3 = dateParts[2];
          
          if (p3.length === 4) {
            // DD/MM/YYYY or MM/DD/YYYY - assume DD/MM/YYYY
            formattedDate = `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
          } else if (p1.length === 4) {
            // YYYY-MM-DD
            formattedDate = `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
          } else {
            continue;
          }

          // Extract hours from multiline cell
          let hours = 0;
          if (typeof cellContent === 'number') {
            hours = cellContent;
          } else if (typeof cellContent === 'string') {
            const lines = cellContent.split(/\r?\n/);
            for (const line of lines) {
              const trimmed = line.trim();
              // The line with just a number is the shift hours
              if (/^\d+(\.\d+)?$/.test(trimmed)) {
                hours = parseFloat(trimmed);
                break; // Found the hours, no need to check other lines
              }
            }
          }

          if (hours > 0) {
            allRosterEntries.push({
              staff_name: staffName,
              date: formattedDate,
              shift_hours: hours
            });
          }
        }
      }
    }
    return allRosterEntries;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatus('idle');
    setMessage('');

    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          let payload: any = [];
          const rawData = results.data as any[][];

          if (type === 'roster') {
            // Heuristic to detect Dayforce format: check for "Employee" and date-like strings in header
            const isDayforce = rawData.some(row => row && row[0]?.toString().trim().toLowerCase() === 'employee') && 
                               rawData.some(row => row && row.slice(1).some((cell: any) => /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(cell?.toString() || '')));

            if (isDayforce) {
              // Group rows by sheet (assuming no explicit sheet separator)
              const sheets: any[][][] = [];
              let currentSheet: any[][] = [];
              for (const row of rawData) {
                // A reasonable heuristic for a new sheet might be the re-appearance of the "Employee" header
                if (row && row[0]?.toString().trim().toLowerCase() === 'employee' && currentSheet.length > 0) {
                  sheets.push(currentSheet);
                  currentSheet = [];
                }
                currentSheet.push(row);
              }
              if (currentSheet.length > 0) {
                sheets.push(currentSheet);
              }
              payload = parseDayforceRoster(sheets);
            } else {
              // Standard flat CSV: staff_name, date, shift_hours
              const startIdx = (rawData[0][0]?.toLowerCase().includes('name') || rawData[0][0]?.toLowerCase().includes('employee')) ? 1 : 0;
              for (let i = startIdx; i < rawData.length; i++) {
                const row = rawData[i];
                if (row[0] && row[1]) {
                  payload.push({
                    staff_name: row[0].toString().trim(),
                    date: row[1].toString().trim(),
                    shift_hours: parseFloat(row[2]) || 0
                  });
                }
              }
            }
          } else {
            // Budget format: date, total_budget, total_hours
            const startIdx = (rawData[0][0]?.toLowerCase().includes('date')) ? 1 : 0;
            for (let i = startIdx; i < rawData.length; i++) {
              const row = rawData[i];
              if (row[0]) {
                const dateStr = row[0].toString().trim();
                if (dateStr === '1899-12-31') continue;

                // Normalize date
                const dateParts = dateStr.split(/[-/]/);
                let formattedDate = dateStr;
                if (dateParts.length === 3) {
                  const p1 = dateParts[0];
                  const p3 = dateParts[2];
                  if (p3.length === 4) {
                    // DD/MM/YYYY or MM/DD/YYYY -> YYYY-MM-DD
                    formattedDate = `${p3}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
                  } else if (p1.length === 4) {
                    // YYYY-MM-DD
                    formattedDate = `${p1}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
                  }
                }

                payload.push({
                  date: formattedDate,
                  total_budget: parseFloat(row[1]) || 0,
                  total_hours: parseFloat(row[2]) || 0
                });
              }
            }
          }

          if (!payload || payload.length === 0) {
            throw new Error("No valid data found in file. Please check the format.");
          }

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (res.ok) {
            setStatus('success');
            const count = payload.length;
            const firstDate = payload[0].date;
            setMessage(`Successfully uploaded ${count} entries. Data starts from ${firstDate}.`);
            onSuccess();
            if (onDateJump && firstDate) onDateJump(firstDate);
          } else {
            const err = await res.json();
            throw new Error(err.error || "Server rejected the data.");
          }
        } catch (error: any) {
          console.error("Upload error:", error);
          setStatus('error');
          setMessage(error.message || "An unexpected error occurred.");
        } finally {
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      }
    });
  };

  return (
    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col h-full">
      <h3 className="text-xl font-black text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-400 mb-6">{description}</p>
      
      <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
      
      <button 
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className={`w-full py-8 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all mb-4 ${
          status === 'success' ? 'border-emerald-500 bg-emerald-50 text-emerald-600' :
          status === 'error' ? 'border-red-500 bg-red-50 text-red-600' :
          'border-slate-200 hover:border-brand hover:bg-brand-light/20 text-slate-400'
        }`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
            <span className="text-xs font-bold uppercase tracking-widest text-brand">Processing...</span>
          </div>
        ) : status === 'success' ? (
          <>
            <CheckCircle2 className="w-10 h-10" />
            <span className="font-bold">Upload Complete</span>
          </>
        ) : status === 'error' ? (
          <>
            <AlertCircle className="w-10 h-10" />
            <span className="font-bold">Upload Failed</span>
          </>
        ) : (
          <>
            <FileUp className="w-10 h-10" />
            <span className="font-bold">Select CSV File</span>
          </>
        )}
      </button>

      {message && (
        <div className={`p-4 rounded-xl text-xs font-medium leading-relaxed ${
          status === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
        }`}>
          {message}
        </div>
      )}
    </div>
  );
}
