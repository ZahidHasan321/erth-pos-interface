// src/components/Header.tsx
export function Header() {
  return (
    <header className="flex flex-row justify-between items-center bg-white p-5 px-6">
      <div className="font-semibold">
        <h1 className="text-xl">ERTH</h1>
        <h2 className="text-lg">Showroom - New Work Order</h2>
      </div>
      <button className=" px-4 py-2 text-white bg-black rounded-lg shadow-sm">
        Logout
      </button>
    </header>
  );
}
