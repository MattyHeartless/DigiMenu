import { notFound } from "next/navigation";
import { getPublicBusiness } from "../../../components/data";

export default async function PdfMenu({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const business = await getPublicBusiness(businessSlug);
  if (!business) notFound();
  if (!business.publishedPdfDocumentId) return <main className="pdf-page"><div className="pdf-page-grain" aria-hidden="true" /><header><a href={`/${businessSlug}`}>← {business.name}</a><span>MENÚ PDF</span></header><section className="pdf-empty"><div className="pdf-icon">PDF</div><h1>Menú temporalmente no disponible.</h1><p>Estamos preparando la versión más reciente del menú. Intenta de nuevo en unos minutos.</p></section></main>;
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5099";
  const pdfUrl = `${api}/api/public/businesses/${businessSlug}/pdf`;
  return <main className="pdf-page"><div className="pdf-page-grain" aria-hidden="true" /><header><a href={`/${businessSlug}`}>← {business.name}</a><span>MENÚ PDF</span></header><section className="pdf-document"><iframe className="pdf-viewer" title={`Menú PDF de ${business.name}`} src={pdfUrl}/><a className="pdf-download" href={pdfUrl} target="_blank">Abrir o descargar PDF <span aria-hidden="true">↗</span></a></section></main>;
}
