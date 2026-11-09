export function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    building: "M4 22V3h12v19M16 8h4v14M2 22h20M8 7h4M8 11h4M8 15h4M9 22v-3h3v3",
    graduation: "m2 9 10-5 10 5-10 5L2 9m4 2v6c4 3 8 3 12 0v-6m4-2v7",
    mail: "M3 5h18v14H3zM3 5l9 8 9-8",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
    search: "M21 21l-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14",
    moon: "M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10",
    sun: "M12 3v2m0 14v2M3 12h2m14 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
    right: "m9 5 7 7-7 7",
    home: "m3 10 9-7 9 7v10h-6v-6H9v6H3z",
    book: "M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2zm0 0v16",
    plus: "M12 5v14M5 12h14",
    users:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 0a4 4 0 0 1 0 8",
    user: "M20 21v-2a7 7 0 0 0-14 0v2m6-18a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
    file: "M14 2H5v20h14V7zm0 0v6h5M8 12h8M8 16h8",
    chart: "M3 3v18h18M7 16v-5m5 5V7m5 9V4",
    target:
      "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
    settings:
      "m9 3-1 3-3 1-2 4 2 2 1 4 3 1 1 3h4l1-3 3-1 1-4 2-2-2-4-3-1-1-3zm3 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
    logout: "M9 3H3v18h6m6-14 5 5-5 5M8 12h12",
    menu: "M3 6h18M3 12h18M3 18h18",
    close: "m6 6 12 12M6 18 18 6",
    chevron: "m6 9 6 6 6-6",
  };
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] ?? paths.file} />
    </svg>
  );
}
