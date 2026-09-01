import Sidebar from "@/components/Sidebar";
import StatCard from "@/components/StatCard";

export default function DashboardPage() {
  return (
    <div className="flex h-full">
      <Sidebar />

      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0">
        <div className="px-6 lg:px-10 py-8">
          {/* header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Overview of your payment routing activity.
            </p>
          </div>

          {/* stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Transactions"
              value="—"
              change="Waiting for data"
            />
            <StatCard
              label="Volume (KES)"
              value="—"
              change="No transactions yet"
            />
            <StatCard
              label="Active Vendors"
              value="0"
              change="Add vendors to get started"
            />
            <StatCard
              label="Pending Payouts"
              value="0"
              change="All caught up"
            />
          </div>

          {/* recent transactions placeholder */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent Transactions</h2>
              <a
                href="/transactions"
                className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
              >
                View all
              </a>
            </div>
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              <p>No transactions yet.</p>
              <p className="mt-1">
                Once a payment webhook is received, it will appear here.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
