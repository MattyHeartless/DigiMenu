import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata = { title: "Tu tienda", description: "Administración del menú digital" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es"><body>{children}</body></html>; }
