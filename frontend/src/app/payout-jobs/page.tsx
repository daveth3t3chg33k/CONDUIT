import Sidebar from "@/components/Sidebar";
import StatusBadge from "@/components/StatusBadge";

export default function PayoutJobsPage() {
  return (
    <div className="flex h-full">
      <Sidebar />

      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0">
        <div className="px-6 lg:px-10 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Payout Jobs</h1>
            <p className="text-sm text-gray-500 mt-1">
              Track outgoing payouts to vendors and their delivery status.
            </p>
          </div>

          {/* status filter pills */}
          <div className="flex items-center gap-3 mb-6">
            <button className="px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
              All
            </button>
            <button className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100">
              Queued
            </button>
            <button className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100">
              Completed
            </button>
            <button className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100">
              Failed
            </button>
            <button className="px-3 py-1.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100">
              Manual Review
            </button>
          </div>

          {/* placeholder table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-6 py-3 font-medium">Job ID</th>
                  <th className="px-6 py-3 font-medium">Vendor</th>
                  <th className="px-6 py-3 font-medium text-right">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Attempts</th>
                  <th className="px-6 py-3 font-medium">Last Error</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    No payout jobs yet.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
