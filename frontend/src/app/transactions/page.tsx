import Sidebar from "@/components/Sidebar";
import StatusBadge from "@/components/StatusBadge";

export default function TransactionsPage() {
  // placeholder — in production this fetches from the backend API
  const transactions: Array<{
    id: string;
    external_ref: string;
    amount_cents: number;
    currency: string;
    status: string;
    received_at: string;
  }> = [];

  return (
    <div className="flex h-full">
      <Sidebar />

      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0">
        <div className="px-6 lg:px-10 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
            <p className="text-sm text-gray-500 mt-1">
              All incoming payments and their processing status.
            </p>
          </div>

          {/* filters */}
          <div className="flex items-center gap-3 mb-6">
            <button className="px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
              All
            </button>
            <button className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100">
              Received
            </button>
            <button className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100">
              Split Computed
            </button>
            <button className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100">
              Paid Out
            </button>
            <button className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100">
              Failed
            </button>
          </div>

          {/* table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-6 py-3 font-medium">Transaction ID</th>
                  <th className="px-6 py-3 font-medium">External Ref</th>
                  <th className="px-6 py-3 font-medium text-right">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      No transactions found.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-mono text-xs">{tx.id.slice(0, 8)}…</td>
                      <td className="px-6 py-3">{tx.external_ref}</td>
                      <td className="px-6 py-3 text-right font-medium">
                        {tx.currency} {(tx.amount_cents / 100).toLocaleString()}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={tx.status} />
                      </td>
                      <td className="px-6 py-3 text-gray-500">{tx.received_at}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
