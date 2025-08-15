import CodenamesGrid from "@/components/CodenamesGrid";

export default function Home() {
  return (
    <div className="font-sans min-h-screen p-8 sm:p-12 flex flex-col items-center gap-8">
      <h1 className="text-2xl sm:text-3xl font-semibold">Codenames Helper</h1>
      <CodenamesGrid />
    </div>
  );
}
