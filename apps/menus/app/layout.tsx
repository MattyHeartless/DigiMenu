import type { Metadata } from "next";
import "./styles.css";
import "./pdf.css";
export const metadata: Metadata = { title: "DigiMenu", description: "Menú digital" };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="es"><body>{children}</body></html>}
