// src/components/Header.tsx
export function Header() {
  return (
    <header className="flex flex-row justify-between items-center bg-white p-10 px-16">
      <div className="font-semibold">
        <h1 className="text-5xl">ERTH</h1>
        <h2 className="text-4xl">Showroom - New Work Order</h2>
      </div>
      <button className=" px-4 py-2 text-white bg-black rounded-lg shadow-sm">
        Logout
      </button>
    </header>
  );
}
