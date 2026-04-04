export default function Section({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-white font-semibold text-sm">{title}</h2>
        <p className="text-gray-500 text-xs mt-0.5">{description}</p>
      </div>
      <div className="rounded-xl border border-plex-border bg-plex-card divide-y divide-plex-border">
        {children}
      </div>
    </div>
  );
}
