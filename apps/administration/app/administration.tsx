"use client";

import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowsClockwise,
  CheckCircle,
  CirclesFour,
  DownloadSimple,
  EnvelopeSimple,
  FilePdf,
  ForkKnife,
  GearSix,
  House,
  ListBullets,
  LockKey,
  MagicWand,
  Plus,
  QrCode,
  SignIn,
  SignOut,
  Sparkle,
  Storefront,
  CaretDown,
  FloppyDisk,
  PencilSimple,
  Tag,
  UploadSimple,
  UserCircle,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import "./modals.css";
import "./catalog-actions.css";
import "./catalog.css";
import "./pdf-workspace.css";
import "./fonts.css";
import "./login.css";
import "./overview.css";
import "./account-menu.css";
import "./templates.css";
import "./settings.css";
import "./businesses.css";

type Category = {
  id: string;
  name: string;
  description?: string | null;
  displayOrder: number;
  isActive: boolean;
};
type Product = {
  id: string;
  categoryId: string;
  name: string;
  description?: string | null;
  price: number;
  displayOrder: number;
  isActive: boolean;
  isAvailable: boolean;
};
type Pdf = {
  id: string;
  version: number;
  status: "Draft" | "Published" | "Archived";
  sourceType: string;
  createdAt: string;
};
type Template = {
  id: string;
  name: string;
  status: "Draft" | "NeedsReview" | "Approved" | "Rejected" | "Archived";
  isActive: boolean;
  pageSize: string;
  orientation: string;
  createdFromAI: boolean;
  coverBackgroundUrl?: string | null;
  innerPageBackgroundUrl?: string | null;
};
type PdfFont = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};
type Analysis = {
  id: string;
  status:
    | "Pending"
    | "Processing"
    | "NeedsReview"
    | "Approved"
    | "Rejected"
    | "Failed";
  confidenceScore?: number | null;
};
type BusinessProfile = {
  id: string;
  name: string;
  slug: string;
  address?: string | null;
  description?: string | null;
  openingHours?: string | null;
  logoUrl?: string | null;
  mode: string;
  hasAnimatedMenu: boolean;
};
type ManagedBusiness = {
  id: string;
  name: string;
  slug: string;
  businessType?: string | null;
  isActive: boolean;
  createdAt: string;
  administrators: Array<{ email: string; displayName?: string | null }>;
};
type BusinessUser = {
  membershipId: string;
  userId: string;
  email: string;
  displayName?: string | null;
  role: "Superadmin" | "BusinessAdmin";
  isActive: boolean;
};
type Session = {
  token: string;
  refreshToken?: string;
  businessId: string;
  businessName: string;
  slug: string;
  role: string;
};
type ModalKind =
  | "category"
  | "product"
  | "template"
  | "analysis"
  | "font"
  | "pdf-upload"
  | "business"
  | "business-admins"
  | null;
type NavItem = { label: string; icon: ReactNode };
type AdminSection =
  | "Inicio"
  | "Productos"
  | "Menú"
  | "Código QR"
  | "Plantillas"
  | "Negocios"
  | "Configuración";
const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5099").replace(
  /\/$/,
  "",
);
const publicMenuUrl = (
  process.env.NEXT_PUBLIC_MENU_URL ?? "http://localhost:3001"
).replace(/\/$/, "");
const publicMenuHref = (slug: string) =>
  `${publicMenuUrl}/${encodeURIComponent(slug)}`;
const apiHeaders = (session: Session, json = false) => ({
  Authorization: `Bearer ${session.token}`,
  "X-Business-ID": session.businessId,
  ...(json ? { "Content-Type": "application/json" } : {}),
});
const demoAdminEmail = process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL ?? "";
const demoAdminPassword = process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD ?? "";

const sectionRoutes: Record<AdminSection, string> = {
  Inicio: "/",
  Productos: "/catalogo",
  Menú: "/documentos",
  "Código QR": "/codigo-qr",
  Plantillas: "/plantillas",
  Negocios: "/negocios",
  Configuración: "/configuracion",
};

export function Administration({
  initialSection = "Inicio",
}: {
  initialSection?: AdminSection;
}) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [platformMode, setPlatformMode] = useState(false);
  const active = initialSection;
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pdfs, setPdfs] = useState<Pdf[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [fonts, setFonts] = useState<PdfFont[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [businesses, setBusinesses] = useState<ManagedBusiness[]>([]);
  const [businessUsers, setBusinessUsers] = useState<BusinessUser[]>([]);
  const [selectedBusinessForUsers, setSelectedBusinessForUsers] =
    useState<ManagedBusiness | null>(null);
  const [businessProfile, setBusinessProfile] =
    useState<BusinessProfile | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalKind>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
  });
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    price: "",
  });
  const [templateForm, setTemplateForm] = useState({
    name: "",
    pageSize: "A4",
    orientation: "Portrait",
  });
  const [businessForm, setBusinessForm] = useState({
    name: "",
    slug: "",
    businessType: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [businessAdminForm, setBusinessAdminForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [analysisFile, setAnalysisFile] = useState<File | null>(null);
  const [headerBackgroundFile, setHeaderBackgroundFile] = useState<File | null>(
    null,
  );
  const [innerBackgroundFile, setInnerBackgroundFile] = useState<File | null>(
    null,
  );
  const [draftHeaderBackground, setDraftHeaderBackground] =
    useState<File | null>(null);
  const [draftInnerBackground, setDraftInnerBackground] = useState<File | null>(
    null,
  );
  const [fontFile, setFontFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [externalPdfFile, setExternalPdfFile] = useState<File | null>(null);
  const [draftPreviewUrl, setDraftPreviewUrl] = useState<string | null>(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [qrSize, setQrSize] = useState(1024);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const refreshInFlight = useRef<Promise<Session | null> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("digimenu-session");
    if (saved) {
      const restored = JSON.parse(saved) as Session;
      sessionRef.current = restored;
      setSession(restored);
      setPlatformMode(restored.role === "Superadmin");
    } else setLoading(false);
  }, []);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    if (session && (session.role !== "Superadmin" || !platformMode))
      void refresh(session);
  }, [session, platformMode]);
  useEffect(() => {
    if (session?.role === "Superadmin") void refreshBusinesses(session);
    else setBusinesses([]);
  }, [session?.token, session?.role]);
  useEffect(() => {
    document.title = businessProfile?.name
      ? `${businessProfile.name} | Tu tienda`
      : "Tu tienda";
  }, [businessProfile?.name]);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node))
        setAccountMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  function saveSession(next: Session) {
    sessionRef.current = next;
    localStorage.setItem("digimenu-session", JSON.stringify(next));
    setSession(next);
  }
  async function renewSession(): Promise<Session | null> {
    if (refreshInFlight.current) return refreshInFlight.current;
    const current = sessionRef.current;
    if (!current?.refreshToken) {
      signOut();
      return null;
    }
    refreshInFlight.current = (async () => {
      try {
        const response = await fetch(`${apiUrl}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: current.refreshToken }),
        });
        if (!response.ok) throw new Error("La sesión ya no puede renovarse.");
        const data = await response.json();
        if (!data.accessToken || !data.refreshToken)
          throw new Error("La respuesta de renovación no es válida.");
        const next = {
          ...current,
          token: data.accessToken,
          refreshToken: data.refreshToken,
        };
        saveSession(next);
        return next;
      } catch {
        signOut();
        return null;
      } finally {
        refreshInFlight.current = null;
      }
    })();
    return refreshInFlight.current;
  }
  async function authenticatedFetch(
    path: string,
    init: RequestInit = {},
    current = session,
  ): Promise<Response> {
    if (!current) throw new Error("Sesión no disponible");
    const send = async (active: Session) => {
      const isForm = init.body instanceof FormData;
      const headers = new Headers(init.headers);
      Object.entries(apiHeaders(active, Boolean(init.body) && !isForm)).forEach(
        ([name, value]) => headers.set(name, value),
      );
      return fetch(`${apiUrl}${path}`, { ...init, headers });
    };
    const response = await send(current);
    if (response.status !== 401) return response;
    const renewed = await renewSession();
    return renewed ? send(renewed) : response;
  }

  async function refresh(current = session) {
    if (!current) return;
    setLoading(true);
    try {
      const requests = [
        authenticatedFetch("/api/admin/categories", {}, current),
        authenticatedFetch("/api/admin/products", {}, current),
        authenticatedFetch("/api/admin/pdf/history", {}, current),
        authenticatedFetch("/api/admin/configuration", {}, current),
      ];
      requests.push(
        authenticatedFetch("/api/admin/design/templates", {}, current),
      );
      requests.push(
        authenticatedFetch("/api/admin/design/analyses", {}, current),
      );
      requests.push(authenticatedFetch("/api/admin/design/fonts", {}, current));
      const responses = await Promise.all(requests);
      if (!responses.every((response) => response.ok))
        throw new Error("No fue posible cargar los datos del negocio.");
      setCategories(await responses[0].json());
      setProducts(await responses[1].json());
      setPdfs(await responses[2].json());
      setBusinessProfile(await responses[3].json());
      if (responses[4]) setTemplates(await responses[4].json());
      if (responses[5]) setAnalyses(await responses[5].json());
      if (responses[6]) setFonts(await responses[6].json());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  async function refreshBusinesses(current = session) {
    if (!current || current.role !== "Superadmin") return;
    try {
      const response = await authenticatedFetch(
        "/api/superadmin/businesses",
        {},
        current,
      );
      if (!response.ok) throw new Error("No fue posible cargar los negocios.");
      setBusinesses(await response.json());
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No fue posible cargar los negocios.",
      );
    }
  }

  const grouped = useMemo(
    () =>
      categories
        .filter((category) => category.isActive)
        .map((category) => ({
          ...category,
          products: products
            .filter(
              (product) =>
                product.categoryId === category.id && product.isActive,
            )
            .sort((a, b) => a.displayOrder - b.displayOrder),
        })),
    [categories, products],
  );
  const published = pdfs.find((document) => document.status === "Published");
  const latestDraft = pdfs.find((document) => document.status === "Draft");

  useEffect(() => {
    let objectUrl: string | null = null;
    if (!session || !latestDraft) {
      setDraftPreviewUrl(null);
      return;
    }
    setDraftPreviewUrl(null);
    void (async () => {
      try {
        const response = await authenticatedFetch(
          `/api/admin/pdf/${latestDraft.id}/preview`,
          {},
          session,
        );
        if (!response.ok)
          throw new Error(
            "No fue posible cargar la vista previa del borrador.",
          );
        objectUrl = URL.createObjectURL(await response.blob());
        setDraftPreviewUrl(objectUrl);
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "No fue posible cargar la vista previa.",
        );
      }
    })();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [session?.token, session?.businessId, latestDraft?.id]);

  useEffect(() => {
    let objectUrl: string | null = null;
    if (!session || active !== "Código QR") {
      setQrPreviewUrl(null);
      return;
    }
    setQrPreviewUrl(null);
    void (async () => {
      try {
        const response = await authenticatedFetch(
          `/api/admin/qr/download?destination=Main&format=png&size=${qrSize}&targetUrl=${encodeURIComponent(publicMenuHref(session.slug))}`,
          {},
          session,
        );
        if (!response.ok)
          throw new Error("No fue posible generar el código QR.");
        objectUrl = URL.createObjectURL(await response.blob());
        setQrPreviewUrl(objectUrl);
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "No fue posible cargar el código QR.",
        );
      }
    })();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [active, session?.token, session?.businessId, qrSize]);
  const navItems: NavItem[] = [
    { label: "Inicio", icon: <House weight="fill" /> },
    { label: "Productos", icon: <ForkKnife weight="bold" /> },
    { label: "Menú", icon: <FilePdf weight="bold" /> },
    { label: "Código QR", icon: <QrCode weight="bold" /> },
    { label: "Plantillas", icon: <MagicWand weight="bold" /> },
    { label: "Configuración", icon: <GearSix weight="bold" /> },
  ];

  async function request(path: string, init?: RequestInit) {
    if (!session) throw new Error("Sesión no disponible");
    const response = await authenticatedFetch(path, init, session);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.message ?? "No se pudo completar la operación.");
    }
    return response;
  }
  function openCategoryModal() {
    setCategoryForm({ name: "", description: "" });
    setFormError("");
    setModal("category");
  }
  function openProductModal(categoryId: string) {
    setTargetCategoryId(categoryId);
    setEditingProduct(null);
    setProductForm({ name: "", description: "", price: "" });
    setFormError("");
    setModal("product");
  }
  function openEditProductModal(product: Product) {
    setTargetCategoryId(product.categoryId);
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      description: product.description ?? "",
      price: String(product.price),
    });
    setFormError("");
    setModal("product");
  }
  function openTemplateModal() {
    setTemplateForm({
      name: `${session?.businessName ?? "Menú"} v1`,
      pageSize: "A4",
      orientation: "Portrait",
    });
    setFormError("");
    setModal("template");
  }
  function openAnalysisModal() {
    setAnalysisFile(null);
    setHeaderBackgroundFile(null);
    setInnerBackgroundFile(null);
    setFormError("");
    setModal("analysis");
  }
  function openFontModal() {
    setFontFile(null);
    setFormError("");
    setModal("font");
  }
  function openPdfUploadModal() {
    setExternalPdfFile(null);
    setFormError("");
    setModal("pdf-upload");
  }
  function openBusinessModal() {
    setBusinessForm({
      name: "",
      slug: "",
      businessType: "",
      adminName: "",
      adminEmail: "",
      adminPassword: "",
    });
    setFormError("");
    setModal("business");
  }
  function closeModal() {
    setModal(null);
    setTargetCategoryId(null);
    setEditingProduct(null);
    setFormError("");
  }
  async function addCategory(event: FormEvent) {
    event.preventDefault();
    if (!categoryForm.name.trim())
      return setFormError("Escribe el nombre de la categoría.");
    setSubmitting(true);
    try {
      await request("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify({
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim() || null,
          displayOrder: categories.length + 1,
          isActive: true,
        }),
      });
      await refresh();
      closeModal();
      setNotice("Categoría creada.");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Error al crear la categoría.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function addProduct(event: FormEvent) {
    event.preventDefault();
    const price = Number(productForm.price);
    if (!productForm.name.trim())
      return setFormError("Escribe el nombre del producto.");
    if (!targetCategoryId || !Number.isFinite(price) || price < 0)
      return setFormError("Ingresa un precio válido.");
    setSubmitting(true);
    try {
      const payload = {
        categoryId: targetCategoryId,
        name: productForm.name.trim(),
        description: productForm.description.trim() || null,
        price,
        displayOrder:
          editingProduct?.displayOrder ??
          products.filter((product) => product.categoryId === targetCategoryId)
            .length + 1,
        isActive: editingProduct?.isActive ?? true,
        isAvailable: editingProduct?.isAvailable ?? true,
      };
      await request(
        editingProduct
          ? `/api/admin/products/${editingProduct.id}`
          : "/api/admin/products",
        {
          method: editingProduct ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
      await refresh();
      closeModal();
      setNotice(editingProduct ? "Producto actualizado." : "Producto creado.");
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Error al guardar el producto.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function deactivateProduct(id: string) {
    try {
      await request(`/api/admin/products/${id}`, { method: "DELETE" });
      await refresh();
      setNotice("Producto desactivado.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Error");
    }
  }
  async function generatePdf() {
    try {
      const form = new FormData();
      if (draftHeaderBackground)
        form.append("headerBackground", draftHeaderBackground);
      if (draftInnerBackground)
        form.append("innerBackground", draftInnerBackground);
      const response = await request("/api/admin/pdf/generate", {
        method: "POST",
        body: form,
      });
      const generated = (await response.json()) as Pdf;
      await refresh();
      setDraftHeaderBackground(null);
      setDraftInnerBackground(null);
      setNotice(
        `Borrador v${generated.version} generado. Revísalo y publícalo cuando esté listo.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Error");
    }
  }
  async function uploadExternalPdf(event: FormEvent) {
    event.preventDefault();
    if (!externalPdfFile) return setFormError("Selecciona un archivo PDF.");
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("file", externalPdfFile);
      const response = await request("/api/admin/pdf/upload", {
        method: "POST",
        body: form,
      });
      const uploaded = (await response.json()) as Pdf;
      await refresh();
      closeModal();
      setNotice(`PDF externo v${uploaded.version} listo para revisión.`);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "No se pudo cargar el PDF.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function publish(id: string) {
    try {
      await request(`/api/admin/pdf/${id}/publish`, { method: "POST" });
      await refresh();
      setNotice("PDF publicado correctamente.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Error");
    }
  }
  async function createTemplate(event: FormEvent) {
    event.preventDefault();
    if (!templateForm.name.trim() || !session)
      return setFormError("Escribe el nombre de la plantilla.");
    setSubmitting(true);
    try {
      await request("/api/admin/design/templates", {
        method: "POST",
        body: JSON.stringify({
          name: templateForm.name.trim(),
          pageSize: templateForm.pageSize,
          orientation: templateForm.orientation,
          layoutConfigurationJson: JSON.stringify({
            categoryStartsNewPage: true,
            margins: 42,
            columns: 1,
          }),
        }),
      });
      await refresh();
      closeModal();
      setNotice("Plantilla creada como borrador para revisión.");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Error al crear la plantilla.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function approveTemplate(id: string) {
    try {
      await request(`/api/admin/design/templates/${id}/activate`, {
        method: "POST",
      });
      await refresh();
      setNotice("Plantilla activada.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Error");
    }
  }
  async function analyzeTemplate(event: FormEvent) {
    event.preventDefault();
    if (!session || !analysisFile)
      return setFormError(
        "Selecciona el PDF que quieres usar como referencia.",
      );
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("file", analysisFile);
      if (headerBackgroundFile)
        form.append("headerBackground", headerBackgroundFile);
      if (innerBackgroundFile)
        form.append("innerBackground", innerBackgroundFile);
      await request("/api/admin/design/analyses/upload", {
        method: "POST",
        body: form,
      });
      await refresh();
      closeModal();
      setNotice(
        "La IA analizó el menú y guardó los fondos seleccionados para la plantilla.",
      );
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Error al solicitar el análisis.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function uploadFont(event: FormEvent) {
    event.preventDefault();
    if (!session || !fontFile)
      return setFormError("Selecciona una fuente .ttf.");
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("file", fontFile);
      await request("/api/admin/design/fonts", { method: "POST", body: form });
      await refresh();
      closeModal();
      setNotice(
        "Fuente cargada. Actívala y genera un PDF nuevo para aplicarla.",
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Error al cargar la fuente.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function activateFont(id: string) {
    try {
      await request(`/api/admin/design/fonts/${id}/activate`, {
        method: "POST",
      });
      await refresh();
      setNotice("Fuente activa para el próximo PDF generado.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Error");
    }
  }
  async function reviewAnalysis(id: string, decision: "approve" | "reject") {
    try {
      await request(`/api/admin/design/analyses/${id}/${decision}`, {
        method: "POST",
      });
      await refresh();
      setNotice(
        decision === "approve"
          ? "Análisis aprobado. Se creó una plantilla en borrador."
          : "Análisis rechazado.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Error");
    }
  }
  async function downloadQr(format: "png" | "svg") {
    try {
      const response = await request(
        `/api/admin/qr/download?destination=Main&format=${format}&size=${qrSize}&targetUrl=${encodeURIComponent(publicMenuHref(session!.slug))}`,
      );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${session?.slug ?? "menu"}-${qrSize}px-qr.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice(`QR ${format.toUpperCase()} descargado.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Error");
    }
  }
  async function setPublicMode(mode: "Pdf" | "Animated") {
    try {
      await request("/api/admin/configuration/public-menu-mode", {
        method: "PUT",
        body: JSON.stringify({ mode }),
      });
      setNotice(
        `La URL pública ahora abrirá el menú ${mode === "Pdf" ? "PDF" : "animado"}.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Error");
    }
  }
  async function saveBusinessProfile(event: FormEvent) {
    event.preventDefault();
    if (!businessProfile) return;
    setSubmitting(true);
    try {
      await request("/api/admin/configuration/business-profile", {
        method: "PUT",
        body: JSON.stringify({
          name: businessProfile.name,
          address: businessProfile.address || null,
          description: businessProfile.description || null,
          openingHours: businessProfile.openingHours || null,
        }),
      });
      await refresh();
      setNotice("Información del negocio actualizada.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la información.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function uploadLogo(event: FormEvent) {
    event.preventDefault();
    if (!logoFile) return setNotice("Selecciona una imagen para el logo.");
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("file", logoFile);
      await request("/api/admin/configuration/logo", {
        method: "POST",
        body: form,
      });
      setLogoFile(null);
      await refresh();
      setNotice("Logo actualizado.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "No se pudo cargar el logo.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function createBusiness(event: FormEvent) {
    event.preventDefault();
    if (
      !businessForm.name.trim() ||
      !businessForm.slug.trim() ||
      !businessForm.adminEmail.trim() ||
      !businessForm.adminPassword
    )
      return setFormError(
        "Completa los datos del negocio y del primer administrador.",
      );
    setSubmitting(true);
    try {
      const response = await request("/api/superadmin/businesses/onboard", {
        method: "POST",
        body: JSON.stringify({
          name: businessForm.name.trim(),
          slug: businessForm.slug.trim(),
          businessType: businessForm.businessType.trim() || null,
          adminDisplayName: businessForm.adminName.trim() || null,
          adminEmail: businessForm.adminEmail.trim(),
          adminPassword: businessForm.adminPassword,
        }),
      });
      const created = (await response.json()) as { business: ManagedBusiness };
      await refreshBusinesses();
      closeModal();
      setNotice(
        `${created.business.name} está listo. Selecciónalo cuando quieras administrar su menú.`,
      );
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "No fue posible crear el negocio.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  function selectBusiness(business: ManagedBusiness) {
    if (!session) return;
    const nextSession = {
      ...session,
      businessId: business.id,
      businessName: business.name,
      slug: business.slug,
    };
    localStorage.setItem("digimenu-session", JSON.stringify(nextSession));
    setPlatformMode(false);
    setSession(nextSession);
    setNotice(`Ahora estás trabajando en ${business.name}.`);
    router.push(sectionRoutes.Configuración);
  }
  async function setBusinessStatus(business: ManagedBusiness) {
    try {
      await request(`/api/superadmin/businesses/${business.id}/status`, {
        method: "PATCH",
        body: JSON.stringify(!business.isActive),
      });
      await refreshBusinesses();
      setNotice(
        business.isActive
          ? `${business.name} fue desactivado.`
          : `${business.name} fue reactivado.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No fue posible actualizar el negocio.",
      );
    }
  }
  async function openBusinessAdministrators(business: ManagedBusiness) {
    setSelectedBusinessForUsers(business);
    setBusinessUsers([]);
    setBusinessAdminForm({ name: "", email: "", password: "" });
    setFormError("");
    setModal("business-admins");
    try {
      const response = await request(
        `/api/superadmin/businesses/${business.id}/users`,
      );
      setBusinessUsers(await response.json());
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "No fue posible cargar los administradores.",
      );
    }
  }
  async function createBusinessAdministrator(event: FormEvent) {
    event.preventDefault();
    if (
      !selectedBusinessForUsers ||
      !businessAdminForm.email.trim() ||
      !businessAdminForm.password
    )
      return setFormError("Escribe el correo y contraseña del administrador.");
    setSubmitting(true);
    try {
      await request(
        `/api/superadmin/businesses/${selectedBusinessForUsers.id}/users`,
        {
          method: "POST",
          body: JSON.stringify({
            email: businessAdminForm.email.trim(),
            password: businessAdminForm.password,
            displayName: businessAdminForm.name.trim() || null,
          }),
        },
      );
      setBusinessAdminForm({ name: "", email: "", password: "" });
      const response = await request(
        `/api/superadmin/businesses/${selectedBusinessForUsers.id}/users`,
      );
      setBusinessUsers(await response.json());
      await refreshBusinesses();
      setNotice(`Administrador agregado a ${selectedBusinessForUsers.name}.`);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "No fue posible crear el administrador.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  function startSession(value: Session) {
    setNotice("");
    setPlatformMode(value.role === "Superadmin");
    setSession(value);
  }
  function returnToPlatform() {
    setPlatformMode(true);
    router.push("/negocios");
  }
  function signOut() {
    localStorage.removeItem("digimenu-session");
    sessionRef.current = null;
    setAccountMenuOpen(false);
    setLoading(false);
    setPlatformMode(false);
    setSession(null);
  }

  if (!session)
    return (
      <>
        <Login onSession={startSession} onError={setNotice} loading={loading} />
        {notice && (
          <div className="notice notice-error login-notice">
            <WarningCircle weight="fill" />
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Cerrar mensaje">
              ×
            </button>
          </div>
        )}
      </>
    );
  if (session.role === "Superadmin" && platformMode)
    return (
      <>
        <SuperadminConsole
          businesses={businesses}
          currentBusinessId={session.businessId}
          onCreate={openBusinessModal}
          onSelect={selectBusiness}
          onStatus={setBusinessStatus}
          onAdministrators={openBusinessAdministrators}
          onSignOut={signOut}
        />
        {notice && (
          <div className="notice">
            <CheckCircle weight="fill" />
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Cerrar mensaje">
              ×
            </button>
          </div>
        )}
        {modal === "business" && (
          <BusinessOnboardingModal
            businessForm={businessForm}
            setBusinessForm={setBusinessForm}
            formError={formError}
            submitting={submitting}
            onClose={closeModal}
            onSubmit={createBusiness}
          />
        )}
        {modal === "business-admins" && selectedBusinessForUsers && (
          <BusinessAdministratorsModal
            business={selectedBusinessForUsers}
            users={businessUsers}
            form={businessAdminForm}
            setForm={setBusinessAdminForm}
            formError={formError}
            submitting={submitting}
            onClose={closeModal}
            onSubmit={createBusinessAdministrator}
          />
        )}
      </>
    );
  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          {businessProfile?.logoUrl ? (
            <img
              className="brand-logo"
              src={`${apiUrl}/api/public/businesses/${businessProfile.slug}/logo`}
              alt={`Logo de ${businessProfile.name}`}
            />
          ) : (
            <span className="brand-mark">
              <Sparkle weight="fill" />
            </span>
          )}
          <b>{businessProfile?.name ?? "DigiMenu"}</b>
        </div>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={() =>
                router.push(sectionRoutes[item.label as AdminSection])
              }
              className={active === item.label ? "is-active" : ""}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="business-card"
            onClick={() => router.push(sectionRoutes.Configuración)}
          >
            <span className="business-avatar">
              {session.businessName.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <b>{session.businessName}</b>
              <small>{session.role}</small>
            </span>
            <GearSix />
          </button>
          <button className="logout" onClick={signOut}>
            <SignOut /> Cerrar sesión
          </button>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            {businessProfile?.logoUrl ? (
              <img
                className="brand-logo"
                src={`${apiUrl}/api/public/businesses/${businessProfile.slug}/logo`}
                alt={`Logo de ${businessProfile.name}`}
              />
            ) : (
              <span className="brand-mark">
                <Sparkle weight="fill" />
              </span>
            )}
            <b>{businessProfile?.name ?? "DigiMenu"}</b>
          </div>
          <div className="page-heading">
            <p>OPERACIÓN DEL NEGOCIO</p>
            <h1>{active}</h1>
          </div>
          <div className="topbar-actions">
            {session.role === "Superadmin" && (
              <button className="platform-return" onClick={returnToPlatform}>
                <Storefront weight="fill" /> Negocios
              </button>
            )}
            <button
              className="icon-button"
              onClick={() => void refresh()}
              aria-label="Actualizar datos"
            >
              <ArrowsClockwise />
            </button>
            <a
              className="icon-button live-menu"
              href={publicMenuHref(session.slug)}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir menú público"
            >
              <Storefront />
            </a>
            <div className="account-menu" ref={accountMenuRef}>
              <button
                className="top-avatar account-menu-trigger"
                onClick={() => setAccountMenuOpen((open) => !open)}
                aria-label="Abrir menú de cuenta"
                aria-expanded={accountMenuOpen}
                aria-controls="account-actions"
              >
                <UserCircle weight="fill" />
              </button>
              {accountMenuOpen && (
                <div className="account-menu-panel" id="account-actions">
                  <div className="account-menu-business">
                    <span>
                      {session.businessName.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <b>{session.businessName}</b>
                      <small>{session.role}</small>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setAccountMenuOpen(false);
                      router.push(sectionRoutes.Configuración);
                    }}
                  >
                    <GearSix weight="fill" /> Configuración
                  </button>
                  <button className="account-menu-logout" onClick={signOut}>
                    <SignOut weight="bold" /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {notice && (
          <div className="notice">
            <CheckCircle weight="fill" />
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Cerrar mensaje">
              ×
            </button>
          </div>
        )}
        {loading ? (
          <LoadingBoard />
        ) : (
          <div className="page-body">
            {active === "Inicio" && (
              <Overview
                published={published}
                session={session}
                categories={grouped}
                onCatalog={() => router.push(sectionRoutes.Productos)}
                onDocuments={() => router.push(sectionRoutes.Menú)}
              />
            )}
            {active === "Productos" && (
              <section className="content-panel">
                <PanelHeader
                  kicker="CARTA DIGITAL"
                  title="Categorías y productos"
                  action={
                    <button
                      className="primary-button"
                      onClick={openCategoryModal}
                    >
                      <Plus weight="bold" /> Nueva categoría
                    </button>
                  }
                />
                {grouped.map((category) => (
                  <article
                    className="catalog-section catalog-category-card"
                    key={category.id}
                  >
                    <div className="catalog-section-head">
                      <div className="catalog-category-title">
                        <span className="section-icon">
                          <ListBullets />
                        </span>
                        <div>
                          <h3>{category.name}</h3>
                          <p>{category.products.length} productos activos</p>
                        </div>
                      </div>
                      <button
                        className="add-product-button"
                        onClick={() => openProductModal(category.id)}
                      >
                        <Plus weight="bold" />
                        <span>Añadir producto</span>
                      </button>
                    </div>
                    {category.products.length ? (
                      <div className="product-list product-grid">
                        {category.products.map((product) => (
                          <article
                            className="catalog-product-card"
                            key={product.id}
                          >
                            <span
                              className={`availability ${product.isAvailable ? "available" : ""}`}
                              aria-label={
                                product.isAvailable
                                  ? "Disponible"
                                  : "No disponible"
                              }
                            />
                            <div className="catalog-product-copy">
                              <b>{product.name}</b>
                              {product.description && (
                                <small>{product.description}</small>
                              )}
                            </div>
                            <strong className="product-price">
                              ${product.price.toFixed(2)}
                            </strong>
                            <div className="product-icon-actions">
                              <button
                                className="catalog-icon-button edit-product"
                                onClick={() => openEditProductModal(product)}
                                aria-label={`Editar ${product.name}`}
                                title="Editar producto"
                              >
                                <PencilSimple weight="bold" />
                              </button>
                              <button
                                className="catalog-icon-button archive-product"
                                onClick={() => deactivateProduct(product.id)}
                                aria-label={`Desactivar ${product.name}`}
                                title="Desactivar producto"
                              >
                                <Archive weight="bold" />
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-inline">
                        Aún no hay productos en esta categoría.
                      </p>
                    )}
                  </article>
                ))}
              </section>
            )}
            {active === "Menú" && (
              <section className="content-panel pdf-workspace">
                <PanelHeader
                  kicker={
                    latestDraft ? "VISTA PREVIA DEL MENÚ" : "MENÚ PUBLICADO"
                  }
                  title="Tu menú"
                />
                <div className="pdf-stage">
                  {latestDraft ? (
                    draftPreviewUrl ? (
                      <iframe
                        className="pdf-viewer"
                        title={`Borrador, versión ${latestDraft.version}`}
                        src={`${draftPreviewUrl}#view=FitH`}
                      />
                    ) : (
                      <div className="pdf-empty">
                        <span>
                          <FilePdf weight="fill" />
                        </span>
                        <h3>Preparando vista previa</h3>
                        <p>
                          Tu borrador se está cargando para que revises los
                          cambios antes de publicarlo.
                        </p>
                      </div>
                    )
                  ) : published ? (
                    <iframe
                      className="pdf-viewer"
                      title={`Menú publicado, versión ${published.version}`}
                      src={`${apiUrl}/api/public/businesses/${session.slug}/pdf#view=FitH`}
                    />
                  ) : (
                    <div className="pdf-empty">
                      <span>
                        <FilePdf weight="fill" />
                      </span>
                      <h3>Aún no hay un PDF publicado</h3>
                      <p>
                        Genera tu primera versión para revisarla y hacerla
                        visible a tus clientes.
                      </p>
                    </div>
                  )}
                </div>
                <div className="pdf-action-bar">
                  <div className="pdf-draft-status">
                    <span
                      className={
                        latestDraft
                          ? "draft-status-icon ready"
                          : "draft-status-icon"
                      }
                    >
                      <FilePdf weight="fill" />
                    </span>
                    <div>
                      <b>
                        {latestDraft
                          ? `Borrador v${latestDraft.version} listo`
                          : "Sin borrador pendiente"}
                      </b>
                      <small>
                        {latestDraft
                          ? "Estás viendo este borrador. Publícalo cuando quieras reemplazar el menú actual."
                          : "Genera una nueva versión cuando actualices tu carta."}
                      </small>
                    </div>
                  </div>
                  <div className="pdf-background-controls">
                    <div className="pdf-background-heading">
                      <Sparkle weight="fill" />
                      <span>
                        <b>Fondos del menú</b>
                        <small>
                          Opcionales: se usan los de la plantilla activa si no
                          cargas archivos personalizados.
                        </small>
                      </span>
                    </div>
                    <label className="pdf-background-upload">
                      <span>
                        <FilePdf weight="fill" /> Encabezado
                      </span>
                      <small>
                        {draftHeaderBackground?.name ??
                          (templates.find((template) => template.isActive)
                            ?.coverBackgroundUrl
                            ? "Fondo actual"
                            : "Sin fondo")}
                      </small>
                      <em>Formato horizontal 3:1 · 2480 × 827 px</em>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) =>
                          setDraftHeaderBackground(
                            event.target.files?.[0] ?? null,
                          )
                        }
                      />
                    </label>
                    <label className="pdf-background-upload">
                      <span>
                        <FilePdf weight="fill" /> Páginas interiores
                      </span>
                      <small>
                        {draftInnerBackground?.name ??
                          (templates.find((template) => template.isActive)
                            ?.innerPageBackgroundUrl
                            ? "Fondo actual"
                            : "Sin fondo")}
                      </small>
                      <em>A4 vertical · 2480 × 3508 px</em>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) =>
                          setDraftInnerBackground(
                            event.target.files?.[0] ?? null,
                          )
                        }
                      />
                    </label>
                  </div>
                  <FontPicker
                    fonts={fonts}
                    onUpload={openFontModal}
                    onActivate={activateFont}
                  />
                  <div className="pdf-buttons">
                    <button
                      className="secondary-button pdf-upload-button"
                      onClick={openPdfUploadModal}
                    >
                      <UploadSimple /> Subir PDF
                    </button>
                    <button
                      className="secondary-button pdf-generate-button"
                      onClick={generatePdf}
                    >
                      <Sparkle weight="fill" /> Generar nuevo
                    </button>
                    <button
                      className="primary-button pdf-publish-button"
                      onClick={() => latestDraft && publish(latestDraft.id)}
                      disabled={!latestDraft}
                    >
                      <FilePdf weight="fill" /> Publicar
                    </button>
                  </div>
                </div>
              </section>
            )}
            {active === "Código QR" && (
              <section className="content-panel qr-panel">
                <PanelHeader
                  kicker="PUNTO DE ACCESO"
                  title="Código QR del menú"
                />
                <div className="qr-layout">
                  <div className="qr-preview">
                    {qrPreviewUrl ? (
                      <img
                        src={qrPreviewUrl}
                        alt={`Código QR del menú de ${session.businessName}`}
                      />
                    ) : (
                      <span className="qr-loading">
                        <QrCode weight="thin" />
                      </span>
                    )}
                  </div>
                  <div>
                    <h2>Tu código QR actual.</h2>
                    <p>
                      Comparte este código con tus clientes para que vean tu
                      menú al instante. Descárgalo para imprimirlo.
                    </p>
                    <div className="qr-options">
                      <label>
                        Tamaño
                        <select
                          value={qrSize}
                          onChange={(event) =>
                            setQrSize(Number(event.target.value))
                          }
                        >
                          <option value={512}>512 px · digital</option>
                          <option value={1024}>1024 px · recomendado</option>
                          <option value={2048}>2048 px · impresión</option>
                        </select>
                      </label>
                    </div>
                    <small className="qr-help">
                      Elige una medida según el uso que le darás.
                    </small>
                    <div className="button-row">
                      <button
                        className="primary-button"
                        onClick={() => downloadQr("png")}
                      >
                        <DownloadSimple /> Descargar PNG
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => downloadQr("svg")}
                      >
                        <DownloadSimple /> Descargar SVG
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}
            {active === "Negocios" && session.role === "Superadmin" && (
              <BusinessDirectory
                businesses={businesses}
                currentBusinessId={session.businessId}
                onCreate={openBusinessModal}
                onSelect={selectBusiness}
                onStatus={setBusinessStatus}
                onAdministrators={openBusinessAdministrators}
              />
            )}
            {active === "Plantillas" && (
              <section className="content-panel">
                <PanelHeader
                  kicker="ACOMODO DE TU MENÚ"
                  title="Presentación de tu carta"
                  action={
                    <div className="template-header-actions">
                      <button
                        className="text-action"
                        onClick={openAnalysisModal}
                      >
                        <MagicWand weight="bold" /> Analizar estilo con IA
                      </button>
                      <button
                        className="primary-button"
                        onClick={openTemplateModal}
                      >
                        <Plus weight="bold" /> Nueva plantilla
                      </button>
                    </div>
                  }
                />
                {analyses
                  .filter((item) => item.status === "NeedsReview")
                  .map((analysis) => (
                    <article className="review-card" key={analysis.id}>
                      <MagicWand weight="fill" />
                      <div>
                        <h3>Propuesta de estilo lista para revisión</h3>
                        <p>
                          Confianza del análisis:{" "}
                          {analysis.confidenceScore ?? "sin dato"}
                        </p>
                      </div>
                      <button
                        className="text-action"
                        onClick={() => reviewAnalysis(analysis.id, "reject")}
                      >
                        Rechazar
                      </button>
                      <button
                        className="primary-button compact"
                        onClick={() => reviewAnalysis(analysis.id, "approve")}
                      >
                        Crear plantilla
                      </button>
                    </article>
                  ))}
                <div className="document-grid">
                  {templates.map((template) => (
                    <article
                      className="document-card template-card"
                      key={template.id}
                    >
                      <div className="document-icon">
                        <Tag weight="fill" />
                      </div>
                      <div>
                        <p>
                          {template.pageSize} · {template.orientation}
                        </p>
                        <h3>{template.name}</h3>
                        <small>
                          {template.isActive
                            ? "Plantilla activa"
                            : template.createdFromAI
                              ? "Sugerida por IA"
                              : template.status}
                        </small>
                      </div>
                      <button
                        className={`template-toggle ${template.isActive ? "is-active" : ""}`}
                        type="button"
                        role="switch"
                        aria-checked={template.isActive}
                        aria-label={
                          template.isActive
                            ? `${template.name} es la plantilla activa`
                            : `Activar ${template.name}`
                        }
                        title={
                          template.isActive
                            ? "Plantilla activa"
                            : "Activar plantilla"
                        }
                        disabled={template.isActive || submitting}
                        onClick={() => approveTemplate(template.id)}
                      >
                        <span />
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {active === "Configuración" && (
              <section className="content-panel settings-panel">
                <PanelHeader
                  kicker="INFORMACIÓN DEL NEGOCIO"
                  title="Tu negocio"
                />
                {businessProfile && (
                  <>
                    <form
                      className="business-profile-form"
                      onSubmit={saveBusinessProfile}
                    >
                      <label>
                        Nombre del negocio
                        <input
                          value={businessProfile.name}
                          onChange={(event) =>
                            setBusinessProfile({
                              ...businessProfile,
                              name: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Domicilio
                        <input
                          value={businessProfile.address ?? ""}
                          onChange={(event) =>
                            setBusinessProfile({
                              ...businessProfile,
                              address: event.target.value,
                            })
                          }
                          placeholder="Calle, número, colonia y ciudad"
                        />
                      </label>
                      <label>
                        Horario de apertura
                        <textarea
                          value={businessProfile.openingHours ?? ""}
                          onChange={(event) =>
                            setBusinessProfile({
                              ...businessProfile,
                              openingHours: event.target.value,
                            })
                          }
                          placeholder="Lun a sáb: 13:00 a 23:00\nDom: 13:00 a 20:00"
                          rows={3}
                        />
                      </label>
                      <label>
                        Descripción del negocio
                        <textarea
                          value={businessProfile.description ?? ""}
                          onChange={(event) =>
                            setBusinessProfile({
                              ...businessProfile,
                              description: event.target.value,
                            })
                          }
                          placeholder="Cuéntales brevemente qué hace especial a tu negocio"
                          rows={4}
                        />
                      </label>
                      <button className="primary-button" disabled={submitting}>
                        {submitting ? (
                          "Guardando"
                        ) : (
                          <>
                            <FloppyDisk /> Guardar información
                          </>
                        )}
                      </button>
                    </form>
                    <div className="business-logo-row">
                      <div>
                        {businessProfile.logoUrl ? (
                          <img
                            src={`${apiUrl}/api/public/businesses/${businessProfile.slug}/logo`}
                            alt="Logo del negocio"
                          />
                        ) : (
                          <span>
                            <Storefront weight="fill" />
                          </span>
                        )}
                        <div>
                          <b>Logo del negocio</b>
                          <small>PNG, JPG o WebP de hasta 5 MB.</small>
                        </div>
                      </div>
                      <form onSubmit={uploadLogo}>
                        <label className="logo-file-picker">
                          <UploadSimple weight="bold" />
                          <span>{logoFile?.name ?? "Elegir archivo"}</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(event) =>
                              setLogoFile(event.target.files?.[0] ?? null)
                            }
                          />
                        </label>
                        <button
                          className="secondary-button"
                          disabled={submitting}
                        >
                          {submitting ? (
                            "Cargando"
                          ) : (
                            <>
                              <UploadSimple /> Cargar logo
                            </>
                          )}
                        </button>
                      </form>
                    </div>
                  </>
                )}
                <div className="settings-divider" />
                <PanelHeader
                  kicker="DESTINO PÚBLICO"
                  title="Modalidad principal"
                />
                <p className="settings-copy">
                  El código QR principal conserva la misma URL. Elige qué
                  experiencia verá el cliente al abrirla.
                </p>
                <div className="mode-grid">
                  <button
                    className="mode-card"
                    onClick={() => setPublicMode("Pdf")}
                  >
                    <FilePdf weight="fill" />
                    <span>
                      <b>Menú PDF</b>
                      <small>Lectura directa del documento publicado</small>
                    </span>
                  </button>
                  <button
                    className="mode-card"
                    onClick={() => setPublicMode("Animated")}
                  >
                    <Sparkle weight="fill" />
                    <span>
                      <b>Menú animado</b>
                      <small>Experiencia dedicada para tu negocio</small>
                    </span>
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
      </section>
      {modal === "category" && (
        <Modal
          title="Nueva categoría"
          description="Agrupa los productos para mantener una carta fácil de explorar."
          onClose={closeModal}
        >
          <form className="modal-form" onSubmit={addCategory}>
            <label>
              Nombre de la categoría
              <input
                autoFocus
                value={categoryForm.name}
                onChange={(event) =>
                  setCategoryForm({ ...categoryForm, name: event.target.value })
                }
                placeholder="Ej. Entradas"
              />
            </label>
            <label>
              Descripción <span>Opcional</span>
              <textarea
                value={categoryForm.description}
                onChange={(event) =>
                  setCategoryForm({
                    ...categoryForm,
                    description: event.target.value,
                  })
                }
                placeholder="Una breve guía para esta sección"
                rows={3}
              />
            </label>
            {formError && <p className="form-error">{formError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeModal}
                disabled={submitting}
              >
                <X /> Cancelar
              </button>
              <button className="primary-button" disabled={submitting}>
                {submitting ? (
                  "Guardando"
                ) : (
                  <>
                    <Plus /> Crear categoría
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "product" && (
        <Modal
          title={editingProduct ? "Editar producto" : "Añadir producto"}
          description={
            editingProduct
              ? "Actualiza la información visible en el menú público."
              : `Se agregará a ${grouped.find((category) => category.id === targetCategoryId)?.name ?? "esta categoría"}.`
          }
          onClose={closeModal}
        >
          <form className="modal-form" onSubmit={addProduct}>
            <label>
              Nombre del producto
              <input
                autoFocus
                value={productForm.name}
                onChange={(event) =>
                  setProductForm({ ...productForm, name: event.target.value })
                }
                placeholder="Ej. Hamburguesa de la casa"
              />
            </label>
            <label>
              Descripción
              <textarea
                value={productForm.description}
                onChange={(event) =>
                  setProductForm({
                    ...productForm,
                    description: event.target.value,
                  })
                }
                placeholder="Ingredientes, tamaño o preparación"
                rows={3}
              />
            </label>
            <label>
              Precio
              <input
                inputMode="decimal"
                value={productForm.price}
                onChange={(event) =>
                  setProductForm({ ...productForm, price: event.target.value })
                }
                placeholder="0.00"
              />
            </label>
            {formError && <p className="form-error">{formError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeModal}
                disabled={submitting}
              >
                <X /> Cancelar
              </button>
              <button className="primary-button" disabled={submitting}>
                {submitting ? (
                  "Guardando"
                ) : (
                  <>
                    <FloppyDisk />{" "}
                    {editingProduct ? "Guardar cambios" : "Crear producto"}
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "template" && (
        <Modal
          title="Nueva plantilla"
          description="La plantilla queda en borrador hasta que un Superadmin la apruebe."
          onClose={closeModal}
        >
          <form className="modal-form" onSubmit={createTemplate}>
            <label>
              Nombre de la plantilla
              <input
                autoFocus
                value={templateForm.name}
                onChange={(event) =>
                  setTemplateForm({ ...templateForm, name: event.target.value })
                }
              />
            </label>
            <div className="form-grid">
              <label>
                Tamaño
                <select
                  value={templateForm.pageSize}
                  onChange={(event) =>
                    setTemplateForm({
                      ...templateForm,
                      pageSize: event.target.value,
                    })
                  }
                >
                  <option>A4</option>
                  <option>Letter</option>
                </select>
              </label>
              <label>
                Orientación
                <select
                  value={templateForm.orientation}
                  onChange={(event) =>
                    setTemplateForm({
                      ...templateForm,
                      orientation: event.target.value,
                    })
                  }
                >
                  <option value="Portrait">Vertical</option>
                  <option value="Landscape">Horizontal</option>
                </select>
              </label>
            </div>
            {formError && <p className="form-error">{formError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeModal}
                disabled={submitting}
              >
                <X /> Cancelar
              </button>
              <button className="primary-button" disabled={submitting}>
                {submitting ? (
                  "Guardando"
                ) : (
                  <>
                    <Plus /> Crear plantilla
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "analysis" && (
        <Modal
          title="Analizar menú de referencia"
          description="Nuestra IA analizará el estilo. Puedes conservar los fondos originales cargándolos por separado para aplicarlos al nuevo menú."
          onClose={closeModal}
        >
          <form className="modal-form" onSubmit={analyzeTemplate}>
            <label>
              Archivo de referencia
              <input
                autoFocus
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={(event) =>
                  setAnalysisFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <p className="form-help">
              PDF, PNG, JPG o WebP de hasta 15 MB. Se analizarán colores,
              jerarquía, tipografía y composición.
            </p>
            <label>
              Fondo del encabezado <span>Opcional</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) =>
                  setHeaderBackgroundFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <label>
              Fondo de páginas interiores <span>Opcional</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) =>
                  setInnerBackgroundFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <p className="form-help">
              Estas imágenes se conservarán como fondo visual. Máximo 10 MB cada
              una.
            </p>
            {formError && <p className="form-error">{formError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeModal}
                disabled={submitting}
              >
                <X /> Cancelar
              </button>
              <button className="primary-button" disabled={submitting}>
                {submitting ? (
                  "Analizando"
                ) : (
                  <>
                    <MagicWand /> Analizar estilo
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "font" && (
        <Modal
          title="Cargar fuente para PDF"
          description="La fuente activa se incorpora al próximo PDF tal como fue cargada. La jerarquía se conserva mediante tamaño, no mediante una fuente de reemplazo."
          onClose={closeModal}
        >
          <form className="modal-form" onSubmit={uploadFont}>
            <label>
              Archivo TrueType (.ttf)
              <input
                autoFocus
                type="file"
                accept=".ttf,font/ttf,application/x-font-ttf"
                onChange={(event) =>
                  setFontFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <p className="form-help">
              Máximo 5 MB. Sube únicamente fuentes que el negocio tenga
              autorización para usar.
            </p>
            {formError && <p className="form-error">{formError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeModal}
                disabled={submitting}
              >
                <X /> Cancelar
              </button>
              <button className="primary-button" disabled={submitting}>
                {submitting ? (
                  "Cargando"
                ) : (
                  <>
                    <UploadSimple /> Cargar fuente
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "pdf-upload" && (
        <Modal
          title="Subir PDF externo"
          description="Carga una carta creada fuera de DigiMenu para revisarla aquí antes de publicarla."
          onClose={closeModal}
        >
          <form className="modal-form" onSubmit={uploadExternalPdf}>
            <label>
              Archivo PDF
              <input
                autoFocus
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  setExternalPdfFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <p className="form-help">
              Máximo 15 MB. El PDF aparecerá como borrador para que lo revises y
              publiques cuando esté listo.
            </p>
            {formError && <p className="form-error">{formError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeModal}
                disabled={submitting}
              >
                <X /> Cancelar
              </button>
              <button className="primary-button" disabled={submitting}>
                {submitting ? (
                  "Cargando"
                ) : (
                  <>
                    <UploadSimple /> Cargar PDF
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "business" && (
        <Modal
          title="Nuevo negocio"
          description="Crea el espacio de trabajo y la primera cuenta que administrará su menú."
          onClose={closeModal}
        >
          <form className="modal-form" onSubmit={createBusiness}>
            <div className="modal-section-label">Datos del negocio</div>
            <label>
              Nombre del negocio
              <input
                autoFocus
                value={businessForm.name}
                onChange={(event) =>
                  setBusinessForm({ ...businessForm, name: event.target.value })
                }
                placeholder="Ej. Restaurante La Estación"
              />
            </label>
            <div className="form-grid">
              <label>
                Identificador público
                <input
                  value={businessForm.slug}
                  onChange={(event) =>
                    setBusinessForm({
                      ...businessForm,
                      slug: event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "-"),
                    })
                  }
                  placeholder="la-estacion"
                />
              </label>
              <label>
                Tipo <span>Opcional</span>
                <input
                  value={businessForm.businessType}
                  onChange={(event) =>
                    setBusinessForm({
                      ...businessForm,
                      businessType: event.target.value,
                    })
                  }
                  placeholder="Restaurante"
                />
              </label>
            </div>
            <p className="form-help">
              La URL pública será: {publicMenuUrl}/
              {businessForm.slug || "tu-negocio"}
            </p>
            <div className="modal-section-label">Primer administrador</div>
            <label>
              Nombre <span>Opcional</span>
              <input
                value={businessForm.adminName}
                onChange={(event) =>
                  setBusinessForm({
                    ...businessForm,
                    adminName: event.target.value,
                  })
                }
                placeholder="Nombre de contacto"
              />
            </label>
            <label>
              Correo electrónico
              <input
                type="email"
                value={businessForm.adminEmail}
                onChange={(event) =>
                  setBusinessForm({
                    ...businessForm,
                    adminEmail: event.target.value,
                  })
                }
                placeholder="admin@negocio.com"
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                minLength={8}
                value={businessForm.adminPassword}
                onChange={(event) =>
                  setBusinessForm({
                    ...businessForm,
                    adminPassword: event.target.value,
                  })
                }
                placeholder="Mínimo 8 caracteres"
              />
            </label>
            {formError && <p className="form-error">{formError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeModal}
                disabled={submitting}
              >
                <X /> Cancelar
              </button>
              <button className="primary-button" disabled={submitting}>
                {submitting ? (
                  "Creando"
                ) : (
                  <>
                    <Plus /> Crear negocio
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}

function SuperadminConsole({
  businesses,
  currentBusinessId,
  onCreate,
  onSelect,
  onStatus,
  onAdministrators,
  onSignOut,
}: {
  businesses: ManagedBusiness[];
  currentBusinessId: string;
  onCreate: () => void;
  onSelect: (business: ManagedBusiness) => void;
  onStatus: (business: ManagedBusiness) => void;
  onAdministrators: (business: ManagedBusiness) => void;
  onSignOut: () => void;
}) {
  return (
    <main className="superadmin-shell">
      <header className="superadmin-topbar">
        <a className="superadmin-brand" href="/negocios">
          <img src="/digimenu-logo-mango.png" alt="DigiMenu" />
        </a>
        <div>
          <span>CONTROL DE PLATAFORMA</span>
          <button className="superadmin-logout" onClick={onSignOut}>
            <SignOut weight="bold" /> Cerrar sesión
          </button>
        </div>
      </header>
      <div className="superadmin-content">
        <BusinessDirectory
          businesses={businesses}
          currentBusinessId={currentBusinessId}
          onCreate={onCreate}
          onSelect={onSelect}
          onStatus={onStatus}
          onAdministrators={onAdministrators}
        />
      </div>
    </main>
  );
}

function BusinessDirectory({
  businesses,
  currentBusinessId,
  onCreate,
  onSelect,
  onStatus,
  onAdministrators,
}: {
  businesses: ManagedBusiness[];
  currentBusinessId: string;
  onCreate: () => void;
  onSelect: (business: ManagedBusiness) => void;
  onStatus: (business: ManagedBusiness) => void;
  onAdministrators: (business: ManagedBusiness) => void;
}) {
  return (
    <section className="businesses-page">
      <div className="businesses-hero">
        <div>
          <p>PLATAFORMA DIGIMENU</p>
          <h2>Negocios</h2>
          <span>
            Crea y administra los espacios de trabajo de cada restaurante desde
            un solo lugar.
          </span>
        </div>
        <button className="primary-button" onClick={onCreate}>
          <Plus weight="bold" /> Nuevo negocio
        </button>
      </div>
      <div className="businesses-summary">
        <div>
          <b>{businesses.length}</b>
          <span>negocios registrados</span>
        </div>
        <div>
          <b>{businesses.filter((business) => business.isActive).length}</b>
          <span>activos</span>
        </div>
        <p>
          Selecciona un negocio para entrar a su operación diaria. Sus
          administradores solo podrán acceder a su propio espacio.
        </p>
      </div>
      {businesses.length ? (
        <div className="businesses-grid">
          {businesses.map((business) => {
            const administrator = business.administrators[0];
            const isCurrent = business.id === currentBusinessId;
            return (
              <article
                className={`business-card-item ${isCurrent ? "is-current" : ""} ${business.isActive ? "" : "is-inactive"}`}
                key={business.id}
              >
                <div className="business-card-top">
                  <span className="business-card-icon">
                    <Storefront weight="fill" />
                  </span>
                  <span
                    className={`business-status ${business.isActive ? "active" : ""}`}
                  >
                    {business.isActive ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <div className="business-card-copy">
                  <h3>{business.name}</h3>
                  <p>
                    /{business.slug}
                    {business.businessType ? ` · ${business.businessType}` : ""}
                  </p>
                </div>
                <div className="business-admin">
                  <UserCircle weight="fill" />
                  <span>
                    <small>Administrador</small>
                    <b>
                      {administrator?.displayName ||
                        administrator?.email ||
                        "Sin administrador"}
                    </b>
                  </span>
                </div>
                <div className="business-card-actions">
                  <button
                    className="secondary-button"
                    onClick={() => onSelect(business)}
                    disabled={!business.isActive}
                  >
                    {isCurrent ? "Administrar negocio" : "Abrir negocio"}
                  </button>
                  <button
                    className="business-admin-button"
                    onClick={() => onAdministrators(business)}
                  >
                    <UsersThree weight="bold" /> Administradores
                  </button>
                  <button
                    className="business-status-button"
                    onClick={() => onStatus(business)}
                    disabled={isCurrent}
                    title={
                      isCurrent
                        ? "Abre otro negocio antes de cambiar el estado de este"
                        : business.isActive
                          ? "Desactivar negocio"
                          : "Activar negocio"
                    }
                  >
                    {business.isActive ? (
                      <Archive weight="bold" />
                    ) : (
                      <CheckCircle weight="bold" />
                    )}
                    <span>{business.isActive ? "Desactivar" : "Activar"}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="content-panel businesses-empty">
          <span>
            <Storefront weight="fill" />
          </span>
          <h3>Tu plataforma está lista</h3>
          <p>
            Crea el primer negocio para configurar su administrador y comenzar
            su menú digital.
          </p>
          <button className="primary-button" onClick={onCreate}>
            <Plus weight="bold" /> Crear primer negocio
          </button>
        </div>
      )}
    </section>
  );
}

function BusinessOnboardingModal({
  businessForm,
  setBusinessForm,
  formError,
  submitting,
  onClose,
  onSubmit,
}: {
  businessForm: {
    name: string;
    slug: string;
    businessType: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  };
  setBusinessForm: (value: {
    name: string;
    slug: string;
    businessType: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  }) => void;
  formError: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <Modal
      title="Nuevo negocio"
      description="Crea el espacio de trabajo y la primera cuenta que administrará su menú."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={onSubmit}>
        <div className="modal-section-label">Datos del negocio</div>
        <label>
          Nombre del negocio
          <input
            autoFocus
            value={businessForm.name}
            onChange={(event) =>
              setBusinessForm({ ...businessForm, name: event.target.value })
            }
            placeholder="Ej. Restaurante La Estación"
          />
        </label>
        <div className="form-grid">
          <label>
            Identificador público
            <input
              value={businessForm.slug}
              onChange={(event) =>
                setBusinessForm({
                  ...businessForm,
                  slug: event.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "-"),
                })
              }
              placeholder="la-estacion"
            />
          </label>
          <label>
            Tipo <span>Opcional</span>
            <input
              value={businessForm.businessType}
              onChange={(event) =>
                setBusinessForm({
                  ...businessForm,
                  businessType: event.target.value,
                })
              }
              placeholder="Restaurante"
            />
          </label>
        </div>
        <p className="form-help">
          La URL pública será: {publicMenuUrl}/
          {businessForm.slug || "tu-negocio"}
        </p>
        <div className="modal-section-label">Primer administrador</div>
        <label>
          Nombre <span>Opcional</span>
          <input
            value={businessForm.adminName}
            onChange={(event) =>
              setBusinessForm({
                ...businessForm,
                adminName: event.target.value,
              })
            }
            placeholder="Nombre de contacto"
          />
        </label>
        <label>
          Correo electrónico
          <input
            type="email"
            value={businessForm.adminEmail}
            onChange={(event) =>
              setBusinessForm({
                ...businessForm,
                adminEmail: event.target.value,
              })
            }
            placeholder="admin@negocio.com"
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            minLength={8}
            value={businessForm.adminPassword}
            onChange={(event) =>
              setBusinessForm({
                ...businessForm,
                adminPassword: event.target.value,
              })
            }
            placeholder="Mínimo 8 caracteres"
          />
        </label>
        {formError && <p className="form-error">{formError}</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={submitting}
          >
            <X /> Cancelar
          </button>
          <button className="primary-button" disabled={submitting}>
            {submitting ? (
              "Creando"
            ) : (
              <>
                <Plus /> Crear negocio
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BusinessAdministratorsModal({
  business,
  users,
  form,
  setForm,
  formError,
  submitting,
  onClose,
  onSubmit,
}: {
  business: ManagedBusiness;
  users: BusinessUser[];
  form: { name: string; email: string; password: string };
  setForm: (value: { name: string; email: string; password: string }) => void;
  formError: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const administrators = users.filter((user) => user.role === "BusinessAdmin");
  return (
    <Modal
      title={`Administradores de ${business.name}`}
      description="Estas cuentas entran directamente al panel de este negocio; no tienen acceso a la consola de plataforma."
      onClose={onClose}
    >
      <div className="business-admins-list">
        {administrators.length ? (
          administrators.map((user) => (
            <div className="business-admin-row" key={user.membershipId}>
              <span>
                <UserCircle weight="fill" />
              </span>
              <div>
                <b>{user.displayName || "Administrador"}</b>
                <small>{user.email}</small>
              </div>
              <em className={user.isActive ? "" : "inactive"}>
                {user.isActive ? "Activo" : "Inactivo"}
              </em>
            </div>
          ))
        ) : (
          <p className="business-admins-empty">
            Aún no hay administradores asignados.
          </p>
        )}
      </div>
      <form className="modal-form business-admin-form" onSubmit={onSubmit}>
        <div className="modal-section-label">Agregar administrador</div>
        <label>
          Nombre <span>Opcional</span>
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Nombre de contacto"
          />
        </label>
        <label>
          Correo electrónico
          <input
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
            }
            placeholder="admin@negocio.com"
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            minLength={8}
            value={form.password}
            onChange={(event) =>
              setForm({ ...form, password: event.target.value })
            }
            placeholder="Mínimo 8 caracteres"
          />
        </label>
        {formError && <p className="form-error">{formError}</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={submitting}
          >
            <X /> Cerrar
          </button>
          <button className="primary-button" disabled={submitting}>
            {submitting ? (
              "Guardando"
            ) : (
              <>
                <UsersThree /> Crear administrador
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FontPicker({
  fonts,
  onUpload,
  onActivate,
}: {
  fonts: PdfFont[];
  onUpload: () => void;
  onActivate: (id: string) => void;
}) {
  const activeFont = fonts.find((font) => font.isActive);
  return (
    <div className="pdf-font-control">
      <label className="pdf-font-select">
        <Tag weight="fill" />
        <span className="pdf-font-label">Tipografía</span>
        <select
          value={activeFont?.id ?? ""}
          onChange={(event) =>
            event.target.value && onActivate(event.target.value)
          }
          aria-label="Tipografía para el próximo documento"
        >
          <option value="" disabled>
            {fonts.length ? "Elige una fuente" : "Sin fuentes cargadas"}
          </option>
          {fonts.map((font) => (
            <option key={font.id} value={font.id}>
              Aa · {font.name}
            </option>
          ))}
        </select>
        <CaretDown weight="bold" />
      </label>
      <button className="secondary-button pdf-font-upload" onClick={onUpload}>
        <Plus weight="bold" /> Cargar fuente
      </button>
    </div>
  );
}

function Overview({
  published,
  session,
  categories,
  onCatalog,
  onDocuments,
}: {
  published?: Pdf;
  session: Session;
  categories: Array<Category & { products: Product[] }>;
  onCatalog: () => void;
  onDocuments: () => void;
}) {
  return (
    <div className="overview-page">
      <section className="welcome-card overview-hero">
        <div className="overview-hero-copy">
          <p>MENÚ EN LÍNEA</p>
          <h2>
            {published
              ? "Todo listo para servir."
              : "Prepara tu próxima carta."}
          </h2>
          <span>
            Gestiona productos, publica cambios y mantén tu carta lista para
            cada servicio.
          </span>
          <div className="button-row">
            <a
              className="primary-button"
              href={publicMenuHref(session.slug)}
              target="_blank"
              rel="noreferrer"
            >
              <Storefront weight="fill" /> Ver menú
            </a>
            <button className="secondary-button" onClick={onCatalog}>
              <PencilSimple weight="fill" /> Editar carta
            </button>
          </div>
        </div>
        <div className="overview-hero-status">
          <span>
            <CheckCircle weight="fill" />
          </span>
          <div>
            <small>ESTADO DEL MENÚ</small>
            <b>
              {published
                ? "Publicado para clientes"
                : "Pendiente de publicación"}
            </b>
          </div>
        </div>
      </section>
      <section className="overview-content">
        <article className="content-panel menu-glance overview-catalog">
          <PanelHeader
            kicker="PRODUCTOS"
            title="Tu carta"
            action={
              <button className="text-action" onClick={onCatalog}>
                Administrar productos
              </button>
            }
          />
          <div className="category-pills">
            {categories.map((category) => (
              <div key={category.id}>
                <span>{category.name.slice(0, 1)}</span>
                <b>{category.name}</b>
                <small>{category.products.length} opciones</small>
              </div>
            ))}
          </div>
        </article>
        <article className="content-panel publication-card overview-publication">
          <p>PUBLICACIÓN</p>
          <h3>
            {published
              ? "El menú público está activo."
              : "Publica tu primer menú."}
          </h3>
          <span>
            {published
              ? "Tus clientes ven la versión más reciente."
              : "Genera una versión desde Menú."}
          </span>
          <button className="secondary-button" onClick={onDocuments}>
            <FilePdf weight="fill" /> Ir al menú
          </button>
        </article>
      </section>
    </div>
  );
}
function PanelHeader({
  kicker,
  title,
  action,
}: {
  kicker: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-header">
      <div>
        <p>{kicker}</p>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function LoadingBoard() {
  return (
    <div className="loading-board">
      <i />
      <i />
      <div>
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-head">
          <div>
            <h2 id="modal-title">{title}</h2>
            <span>{description}</span>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Cerrar formulario"
          >
            <X weight="bold" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Login({
  onSession,
  onError,
  loading,
}: {
  onSession: (value: Session) => void;
  onError: (value: string) => void;
  loading: boolean;
}) {
  const [email, setEmail] = useState(demoAdminEmail);
  const [password, setPassword] = useState(demoAdminPassword);
  const [rememberMe, setRememberMe] = useState(false);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const login = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      if (!login.ok) throw new Error("Correo o contraseña incorrectos.");
      const data = await login.json();
      if (
        !data.accessToken ||
        !data.refreshToken ||
        !data.business?.id ||
        !data.business?.slug ||
        !data.business?.name
      )
        throw new Error("No fue posible iniciar la sesión de forma segura.");
      const next = {
        token: data.accessToken,
        refreshToken: data.refreshToken,
        businessId: data.business.id,
        businessName: data.business.name,
        slug: data.business.slug,
        role: data.user.role,
      };
      localStorage.setItem("digimenu-session", JSON.stringify(next));
      onSession(next);
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "No se pudo iniciar sesión.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="login-shell">
      <section className="login-intro">
        <div className="login-intro-content">
          <div className="login-intro-brand">
            <img src="/digimenu-logo-mango.png" alt="DigiMenu" />
          </div>
          <div className="login-intro-copy">
            <h1>
              Tu menú, listo
              <br />
              para cada servicio.
            </h1>
            <span>
              Organiza productos, publica cambios y comparte un menú que sí se
              siente tuyo.
            </span>
          </div>
        </div>
      </section>
      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <h2>Inicia sesión</h2>
          <label>
            Correo electrónico
            <span className="login-input">
              <EnvelopeSimple weight="bold" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </span>
          </label>
          <label>
            Contraseña
            <span className="login-input">
              <LockKey weight="bold" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
              />
            </span>
          </label>
          <label className="remember-session">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span>Mantener sesión abierta</span>
          </label>
          <button
            className="primary-button login-button"
            disabled={pending || loading}
          >
            <SignIn weight="bold" />
            {pending ? "Verificando acceso" : "Entrar al panel"}
          </button>
        </form>
      </section>
    </main>
  );
}
