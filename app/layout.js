import "./globals.css";

export const metadata = {
  title: "Monitoring Tilawah Al-Qur'an — SMPN 36 Bandung",
  description: "Monitoring Pembiasaan Jam Pertama Baca Al-Qur'an SMP Negeri 36 Bandung",
  icons: {
    icon: "/logo-smpn36.jpg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="font-body">{children}</body>
    </html>
  );
}
