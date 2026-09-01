import Sidebar from "@/components/Sidebar";

export default function VendorsPage() {
  return (
    <div className="flex h-full">
      <Sidebar />

      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0">
        <div className="px-6 lg:px-10 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage vendors and their payout destinations.
              </p>
            </div>
            <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
              Add Vendor
            </button>
          </div>

          {/* placeholder list */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              <p>No vendors registered yet.</p>
              <p className="mt-1">
                Add your first vendor to start configuring split rules.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
